import {createHmac,timingSafeEqual} from 'node:crypto';
import {codingId} from '@/lib/coding-contract';

function signingKey() {
  const key=Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY||'','base64');
  if(key.length!==32)throw new Error('SERVER_CONFIGURATION_ERROR');return key;
}
const signature=(text:string)=>createHmac('sha256',signingKey()).update('coding-inference-v1:'+text).digest('base64url');
export function inferenceToken(jobId:string,claimId:string,now=Date.now()) {
  const text=[codingId(jobId),codingId(claimId),Math.floor(now/1000)+480].join('.');return 'jci_'+text+'.'+signature(text);
}
export function verifyInferenceToken(token:string,now=Date.now()) {
  const parts=token.replace(/^jci_/,'').split('.');if(!token.startsWith('jci_')||parts.length!==4)throw new Error('AUTH_REQUIRED');
  const [jobId,claimId,expiry,mac]=parts;try{codingId(jobId);codingId(claimId);}catch{throw new Error('AUTH_REQUIRED');}
  if(!/^\d{10}$/.test(expiry)||Number(expiry)<=Math.floor(now/1000)||Number(expiry)>Math.floor(now/1000)+480)throw new Error('AUTH_REQUIRED');
  const a=Buffer.from(mac);const b=Buffer.from(signature(parts.slice(0,3).join('.')));
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('AUTH_REQUIRED');return {jobId,claimId};
}
export const inferenceEndpoints:Record<string,string>={
  openai:'https://api.openai.com/v1/chat/completions',gemini:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  claude:'https://api.anthropic.com/v1/chat/completions',custom:'https://openrouter.ai/api/v1/chat/completions',
  deepseek:'https://api.deepseek.com/chat/completions',groq:'https://api.groq.com/openai/v1/chat/completions',
};
export function inferenceInput(body:any,provider:string,model:string) {
  if(!body||body.model!==model||!Array.isArray(body.messages)||!body.messages.length||body.messages.length>200||!inferenceEndpoints[provider])throw new Error('CODING_INPUT_INVALID');
  const messages=body.messages.map((m:any)=>{
    if(!m||!['system','developer','assistant','user','tool'].includes(m.role))throw new Error('CODING_INPUT_INVALID');
    let content=m.content;
    if(Array.isArray(content)){if(!content.every(p=>p?.type==='text'&&typeof p.text==='string'))throw new Error('CODING_INPUT_INVALID');content=content.map(p=>p.text).join('\n');}
    if(content!==null&&content!==undefined&&typeof content!=='string')throw new Error('CODING_INPUT_INVALID');
    return {role:m.role,content:content??null,...(m.tool_calls?{tool_calls:m.tool_calls}:{}),...(m.tool_call_id?{tool_call_id:m.tool_call_id}:{}),...(provider==='deepseek'&&typeof m.reasoning_content==='string'?{reasoning_content:m.reasoning_content}:{})};
  });
  const data:Record<string,unknown>={model,messages,stream:body.stream===true,...(Array.isArray(body.tools)?{tools:body.tools}:{}),tool_choice:'auto'};
  if(provider==='openai')data.max_completion_tokens=4096;else data.max_tokens=4096;
  return data;
}
