import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser,getServiceSupabase } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { codingFailure,codingHash } from '@/lib/server/coding-sessions';
import { codingId,codingText,codingModels } from '@/lib/coding-contract';
import {getUserProviderApiKey} from '@/lib/server/provider-secrets';
import {listProviderModels} from '@/lib/server/provider-models';
import type {ApiProvider} from '@/lib/server/provider-health';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function GET(request: Request) {
  try {
    const {user}=await requireUser(request); const db=getServiceSupabase(); const now=new Date().toISOString();
    const catalog=new URL(request.url).searchParams.get('catalog');
    if(catalog){const {data:c}=await db.from('provider_connections').select('id,provider').eq('id',codingId(catalog)).eq('user_id',user.id).eq('connection_type','api_key').maybeSingle();if(!c)throw new Error('CODING_NOT_FOUND');const key=await getUserProviderApiKey(user.id,c.provider as ApiProvider,c.id);if(!key)throw new Error('CODING_NOT_FOUND');return NextResponse.json({models:await listProviderModels(c.provider,key),provider:c.provider==='custom'?'openrouter':c.provider},{headers});}
    await db.from('coding_sessions').update({status:'interrupted',error_code:'EXECUTOR_DISCONNECTED',finished_at:now}).eq('user_id',user.id).in('status',['preparing','running','verifying']).lt('lease_until',now);
    const jobId=new URL(request.url).searchParams.get('session');
    if(jobId){const {data,error}=await db.from('coding_sessions').select('id,status,prompt,provider,model,model_source,connection_id,events,report,error_code,cancel_requested,created_at').eq('user_id',user.id).eq('id',codingId(jobId)).maybeSingle();if(error)throw new Error('CODING_STORAGE_FAILED');if(!data)throw new Error('CODING_NOT_FOUND');const {data:activity,error:logError}=await db.from('coding_activity').select('sequence,event,created_at').eq('session_id',data.id).eq('user_id',user.id).order('sequence').limit(500);if(logError)throw new Error('CODING_STORAGE_FAILED');return NextResponse.json({session:{...data,activity:activity||[]}},{headers});}
    const results=await Promise.all([
      db.from('coding_executors').select('id,name,last_seen_at,expires_at,revoked_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50),
      db.from('coding_projects').select('id,name,local_id,executor_id,models,test_command,jetree_models_enabled').eq('user_id',user.id).limit(100),
      db.from('coding_sessions').select('id,project_id,executor_id,agent_id,prompt,status,provider,model,error_code,created_at,cancel_requested').eq('user_id',user.id).order('created_at',{ascending:false}).limit(40),
      db.from('provider_connections').select('id,provider,metadata').eq('user_id',user.id).eq('connection_type','api_key').in('status',['configured','connected']).limit(50),
    ]);
    if(results.some(result=>result.error))throw new Error('CODING_STORAGE_FAILED');
    return NextResponse.json({executors:results[0].data,projects:results[1].data,sessions:results[2].data,apiConnections:results[3].data},{headers});
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
      if(['queued','preparing','running','verifying'].includes(data.status)){
        const {error:cancelError}=await db.from('coding_sessions').update({cancel_requested:true}).eq('id',data.id).eq('user_id',user.id).in('status',['queued','preparing','running','verifying']);
        if(cancelError)throw new Error('CODING_STORAGE_FAILED');
        const {error:queueError}=await db.from('coding_sessions').update({status:'cancelled',finished_at:new Date().toISOString()}).eq('id',data.id).eq('user_id',user.id).eq('status','queued');
        if(queueError)throw new Error('CODING_STORAGE_FAILED');
      }
      return NextResponse.json({ok:true},{headers});
    }
    if(body.action!=='create' || body.authorized!==true)throw new Error('CODING_INPUT_INVALID');
    const projectId=codingId(body.projectId);const requestId=codingId(body.requestId);const prompt=codingText(body.prompt,8000);const model=codingModels([{provider:body.provider,model:body.model}])[0];
    const {data:previous}=await db.from('coding_sessions').select('id').eq('user_id',user.id).eq('request_id',requestId).maybeSingle();if(previous)return NextResponse.json({id:previous.id},{headers});
    const {data:project}=await db.from('coding_projects').select('id,executor_id,models,jetree_models_enabled').eq('user_id',user.id).eq('id',projectId).maybeSingle();
    const {data:executor}=await db.from('coding_executors').select('id').eq('user_id',user.id).eq('id',project?.executor_id||'00000000-0000-0000-0000-000000000000').is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(!project||!executor)throw new Error('CODING_NOT_FOUND');
    const source=body.connectionId?'jetree':'local';const connectionId=body.connectionId?codingId(body.connectionId):null;
    if(source==='jetree'){
      if(!project.jetree_models_enabled)throw new Error('CODING_NOT_FOUND');
      const {data:c}=await db.from('provider_connections').select('id,provider').eq('id',connectionId).eq('user_id',user.id).eq('connection_type','api_key').in('status',['configured','connected']).maybeSingle();
      if(!c||(c.provider==='custom'?'openrouter':c.provider)!==model.provider)throw new Error('CODING_NOT_FOUND');
      const key=await getUserProviderApiKey(user.id,c.provider as ApiProvider,c.id);if(!key||!(await listProviderModels(c.provider,key)).some(m=>m.value===model.model))throw new Error('CODING_NOT_FOUND');
    }else if(!codingModels(project.models).some(item=>item.provider===model.provider&&item.model===model.model))throw new Error('CODING_NOT_FOUND');
    if(body.agentId){const {data:agent}=await client.from('agents').select('id').eq('id',codingId(body.agentId)).is('deleted_at',null).maybeSingle();if(!agent)throw new Error('CODING_NOT_FOUND');}
    const {count}=await db.from('coding_sessions').select('id',{count:'exact',head:true}).eq('user_id',user.id).in('status',['queued','preparing','running','verifying']);if((count||0)>=20)throw new Error('CODING_BUSY');
    const {data,error}=await db.from('coding_sessions').insert({user_id:user.id,executor_id:executor.id,project_id:project.id,request_id:requestId,prompt,...model,model_source:source,connection_id:connectionId,agent_id:body.agentId||null}).select('id').single();
    if(error){const {data:retry}=await db.from('coding_sessions').select('id').eq('user_id',user.id).eq('request_id',requestId).maybeSingle();if(retry)return NextResponse.json({id:retry.id},{headers});throw new Error('CODING_STORAGE_FAILED');}
    return NextResponse.json({id:data.id},{headers,status:201});
  }catch(error){return codingFailure(error);}
}
