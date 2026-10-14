import {randomUUID} from 'node:crypto';
import {getServiceSupabase} from '@/lib/server/auth';
import {readBoundedJson} from '@/lib/server/bounded-json';
import {verifyInferenceToken,inferenceEndpoints,inferenceInput} from '@/lib/server/coding-inference';
import {getUserProviderApiKey} from '@/lib/server/provider-secrets';
import type {ApiProvider} from '@/lib/server/provider-health';
export const runtime='nodejs';
export async function POST(request:Request) {
  let release:(()=>Promise<void>)|undefined;
  const deny=(status:number)=>Response.json({error:'CODING_INFERENCE_DENIED'},{status,headers:{'Cache-Control':'no-store'}});
  try {
    const identity=verifyInferenceToken(request.headers.get('authorization')?.replace(/^Bearer /,'')||'');
    const db=getServiceSupabase();
    const {data:job}=await db.from('coding_sessions').select('id,user_id,executor_id,claim_id,connection_id,model_source,provider,model,status,cancel_requested,lease_until').eq('id',identity.jobId).eq('claim_id',identity.claimId).maybeSingle();
    if(!job||job.model_source!=='jetree'||!job.connection_id||!['preparing','running'].includes(job.status)||job.cancel_requested||new Date(job.lease_until).getTime()<=Date.now())return deny(403);
    const {data:connection}=await db.from('provider_connections').select('id,provider,status,connection_type').eq('id',job.connection_id).eq('user_id',job.user_id).maybeSingle();
    if(!connection||connection.connection_type!=='api_key'||!['configured','connected'].includes(connection.status)||(connection.provider==='custom'?'openrouter':connection.provider)!==job.provider)return deny(403);
    const input=inferenceInput(await readBoundedJson(request,512000),connection.provider,job.model);
    const ticket=randomUUID();const {data:reserved,error}=await db.rpc('reserve_coding_inference',{p_job:job.id,p_claim:job.claim_id,p_ticket:ticket});
    if(error||!reserved)return deny(429);
    release=async()=>{await db.from('coding_sessions').update({inference_until:null,inference_ticket:null}).eq('id',job.id).eq('claim_id',job.claim_id).eq('inference_ticket',ticket);};
    const key=await getUserProviderApiKey(job.user_id,connection.provider as ApiProvider,connection.id);if(!key)return deny(403);
    const upstream=await fetch(inferenceEndpoints[connection.provider],{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(connection.provider==='claude'?{'anthropic-version':'2023-06-01'}:{})},body:JSON.stringify(input),redirect:'error',cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])});
    if(!upstream.ok||!upstream.body){await upstream.body?.cancel();return deny([400,401,403,413,429].includes(upstream.status)?upstream.status:502);}
    const reader=upstream.body.getReader();let bytes=0;const finish=release;release=undefined;
    return new Response(new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){await finish();controller.close();return;}bytes+=part.value.length;if(bytes>4*1024*1024)throw new Error('LIMIT');controller.enqueue(part.value);}catch{await reader.cancel().catch(()=>{});await finish();controller.error(new Error('CODING_INFERENCE_FAILED'));}},async cancel(){await reader.cancel().catch(()=>{});await finish();}}),{headers:{'Content-Type':input.stream?'text/event-stream':'application/json','Cache-Control':'no-store'}});
  }catch(error){const code=error instanceof Error?error.message:'';return deny(code==='AUTH_REQUIRED'?401:['CODING_INPUT_INVALID','BODY_TOO_LARGE'].includes(code)?400:502);}
  finally{await release?.();}
}
