import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { codingHash,codingToken,codingFailure,requireCodingExecutor } from '@/lib/server/coding-sessions';
import { codingId,codingText,codingModels,codingReport } from '@/lib/coding-contract';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function POST(request: Request) {
  try {
    const body=await readBoundedJson(request,request.headers.has('authorization')?500000:20000);const db=getServiceSupabase();
    if(body.action==='pair'){
      if(typeof body.code!=='string'||!/^[a-f0-9]{32}$/.test(body.code)||!Array.isArray(body.projects)||body.projects.length<1||body.projects.length>10)throw new Error('CODING_INPUT_INVALID');
      const name=codingText(body.name,80);
      const projects=body.projects.map((p:any)=>{if(typeof p.localId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.localId))throw new Error('CODING_INPUT_INVALID');return {local_id:p.localId,name:codingText(p.name,80),test_command:codingText(p.testCommand,1000),models:codingModels(p.models)};});
      if(new Set(projects.map((p:any)=>p.local_id)).size!==projects.length)throw new Error('CODING_INPUT_INVALID');
      const {data:pair,error:pairError}=await db.from('coding_pair_codes').delete().eq('code_hash',codingHash(body.code)).gt('expires_at',new Date().toISOString()).select('user_id').maybeSingle();
      if(pairError)throw new Error('CODING_STORAGE_FAILED');if(!pair)throw new Error('CODING_PAIR_INVALID');
      const token=codingToken();const expires=new Date(Date.now()+30*86400000).toISOString();
      const {data:executor,error}=await db.from('coding_executors').insert({name,user_id:pair.user_id,token_hash:codingHash(token),expires_at:expires}).select('id').single();if(error)throw new Error('CODING_STORAGE_FAILED');
      const {data:registered,error:projectError}=await db.from('coding_projects').insert(projects.map((p:any)=>({...p,user_id:pair.user_id,executor_id:executor.id}))).select('id,local_id');
      if(projectError){await db.from('coding_executors').delete().eq('id',executor.id);throw new Error('CODING_STORAGE_FAILED');}
      return NextResponse.json({token,executorId:executor.id,projects:registered,expiresAt:expires},{headers});
    }
    const executor=await requireCodingExecutor(request);
    if(body.action==='claim'){
      const {data,error}=await db.rpc('claim_coding_session',{p_executor:executor.id,p_user:executor.user_id});if(error)throw new Error('CODING_STORAGE_FAILED');
      const job=data?.[0];return NextResponse.json({job:job?{id:job.id,claimId:job.claim_id,projectId:job.project_id,prompt:job.prompt,provider:job.provider,model:job.model}:null},{headers});
    }
    const jobId=codingId(body.jobId);const claim=codingId(body.claimId);
    if(body.action==='progress'){
      if(!Number.isInteger(body.sequence)||!['preparing','running','verifying'].includes(body.stage))throw new Error('CODING_INPUT_INVALID');
      const {data,error}=await db.rpc('touch_coding_session',{p_executor:executor.id,p_user:executor.user_id,p_job:jobId,p_claim:claim,p_sequence:body.sequence,p_stage:body.stage});if(error)throw new Error('CODING_STORAGE_FAILED');if(!data?.[0])throw new Error('CODING_NOT_FOUND');
      return NextResponse.json({cancel:data[0].cancel_requested||!['preparing','running','verifying'].includes(data[0].status)},{headers});
    }
    if(body.action==='complete'){
      const {data:job,error}=await db.from('coding_sessions').select('project_id').eq('id',jobId).eq('executor_id',executor.id).eq('user_id',executor.user_id).eq('claim_id',claim).maybeSingle();if(error)throw new Error('CODING_STORAGE_FAILED');if(!job)throw new Error('CODING_NOT_FOUND');
      const {data:project}=await db.from('coding_projects').select('test_command').eq('id',job.project_id).eq('user_id',executor.user_id).maybeSingle();if(!project)throw new Error('CODING_NOT_FOUND');
      let report=null;let status=body.status;
      if(['ready_for_review','tests_failed'].includes(status)){report=codingReport(body.report,project.test_command);if(report.state!==status)throw new Error('CODING_REPORT_INVALID');}
      else if(!['failed','interrupted','cancelled'].includes(status))throw new Error('CODING_INPUT_INVALID');
      const errorCode=typeof body.errorCode==='string'&&/^[A-Z_]{1,80}$/.test(body.errorCode)?body.errorCode:null;
      const {data,error:finishError}=await db.rpc('finish_coding_session',{p_executor:executor.id,p_user:executor.user_id,p_job:jobId,p_claim:claim,p_status:status,p_report:report,p_error:errorCode});if(finishError)throw new Error('CODING_STORAGE_FAILED');if(!data)throw new Error('CODING_NOT_FOUND');
      return NextResponse.json({ok:true},{headers});
    }
    throw new Error('CODING_INPUT_INVALID');
  }catch(error){return codingFailure(error);}
}
