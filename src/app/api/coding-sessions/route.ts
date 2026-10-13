import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser,getServiceSupabase } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { codingFailure,codingHash } from '@/lib/server/coding-sessions';
import { codingId,codingText,codingModels } from '@/lib/coding-contract';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function GET(request: Request) {
  try {
    const {user}=await requireUser(request); const db=getServiceSupabase(); const now=new Date().toISOString();
    await db.from('coding_sessions').update({status:'interrupted',error_code:'EXECUTOR_DISCONNECTED',finished_at:now}).eq('user_id',user.id).in('status',['preparing','running','verifying']).lt('lease_until',now);
    const jobId=new URL(request.url).searchParams.get('session');
    if(jobId){const {data,error}=await db.from('coding_sessions').select('id,status,prompt,provider,model,events,report,error_code,cancel_requested,created_at').eq('user_id',user.id).eq('id',codingId(jobId)).maybeSingle();if(error)throw new Error('CODING_STORAGE_FAILED');if(!data)throw new Error('CODING_NOT_FOUND');return NextResponse.json({session:data},{headers});}
    const results=await Promise.all([
      db.from('coding_executors').select('id,name,last_seen_at,expires_at,revoked_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50),
      db.from('coding_projects').select('id,name,local_id,executor_id,models,test_command').eq('user_id',user.id).limit(100),
      db.from('coding_sessions').select('id,project_id,executor_id,agent_id,prompt,status,provider,model,error_code,created_at,cancel_requested').eq('user_id',user.id).order('created_at',{ascending:false}).limit(40),
    ]);
    if(results.some(result=>result.error))throw new Error('CODING_STORAGE_FAILED');
    return NextResponse.json({executors:results[0].data,projects:results[1].data,sessions:results[2].data},{headers});
  }catch(error){return codingFailure(error);}
}
export async function POST(request: Request) {
  try {
    const {user,client}=await requireUser(request);const body=await readBoundedJson(request,12000);const db=getServiceSupabase();
    if(body.action==='pair'){
      const code=randomBytes(16).toString('hex');const expires=new Date(Date.now()+600000).toISOString();
      await db.from('coding_pair_codes').delete().eq('user_id',user.id);
      const {error}=await db.from('coding_pair_codes').insert({user_id:user.id,code_hash:codingHash(code),expires_at:expires});if(error)throw new Error('CODING_STORAGE_FAILED');
      return NextResponse.json({code,expiresAt:expires},{headers});
    }
    if(body.action==='revoke'){
      const executorId=codingId(body.executorId);const {data,error}=await db.from('coding_executors').update({revoked_at:new Date().toISOString()}).eq('user_id',user.id).eq('id',executorId).select('id').maybeSingle();if(error)throw new Error('CODING_STORAGE_FAILED');if(!data)throw new Error('CODING_NOT_FOUND');
      await db.from('coding_sessions').update({status:'cancelled',cancel_requested:true,finished_at:new Date().toISOString()}).eq('user_id',user.id).eq('executor_id',executorId).eq('status','queued');
      await db.from('coding_sessions').update({cancel_requested:true}).eq('user_id',user.id).eq('executor_id',executorId).in('status',['preparing','running','verifying']);
      return NextResponse.json({ok:true},{headers});
    }
    if(body.action==='cancel'){
      const {data,error}=await db.from('coding_sessions').select('id,status').eq('id',codingId(body.sessionId)).eq('user_id',user.id).maybeSingle();if(error)throw new Error('CODING_STORAGE_FAILED');if(!data)throw new Error('CODING_NOT_FOUND');
      if(['queued','preparing','running','verifying'].includes(data.status))await db.from('coding_sessions').update({cancel_requested:true,...(data.status==='queued'?{status:'cancelled',finished_at:new Date().toISOString()}: {})}).eq('id',data.id).eq('user_id',user.id).eq('status',data.status);
      return NextResponse.json({ok:true},{headers});
    }
    if(body.action!=='create' || body.authorized!==true)throw new Error('CODING_INPUT_INVALID');
    const projectId=codingId(body.projectId);const requestId=codingId(body.requestId);const prompt=codingText(body.prompt,8000);const model=codingModels([{provider:body.provider,model:body.model}])[0];
    const {data:previous}=await db.from('coding_sessions').select('id').eq('user_id',user.id).eq('request_id',requestId).maybeSingle();if(previous)return NextResponse.json({id:previous.id},{headers});
    const {data:project}=await db.from('coding_projects').select('id,executor_id,models').eq('user_id',user.id).eq('id',projectId).maybeSingle();
    const {data:executor}=await db.from('coding_executors').select('id').eq('user_id',user.id).eq('id',project?.executor_id||'00000000-0000-0000-0000-000000000000').is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(!project||!executor||!codingModels(project.models).some(item=>item.provider===model.provider&&item.model===model.model))throw new Error('CODING_NOT_FOUND');
    if(body.agentId){const {data:agent}=await client.from('agents').select('id').eq('id',codingId(body.agentId)).is('deleted_at',null).maybeSingle();if(!agent)throw new Error('CODING_NOT_FOUND');}
    const {count}=await db.from('coding_sessions').select('id',{count:'exact',head:true}).eq('user_id',user.id).in('status',['queued','preparing','running','verifying']);if((count||0)>=20)throw new Error('CODING_BUSY');
    const {data,error}=await db.from('coding_sessions').insert({user_id:user.id,executor_id:executor.id,project_id:project.id,request_id:requestId,prompt,...model,agent_id:body.agentId||null}).select('id').single();
    if(error){const {data:retry}=await db.from('coding_sessions').select('id').eq('user_id',user.id).eq('request_id',requestId).maybeSingle();if(retry)return NextResponse.json({id:retry.id},{headers});throw new Error('CODING_STORAGE_FAILED');}
    return NextResponse.json({id:data.id},{headers,status:201});
  }catch(error){return codingFailure(error);}
}
