import test from 'node:test';
import assert from 'node:assert/strict';
import {callAIProvider,permanentProviderFailure,providerErrorMessage} from '../../src/lib/agents/provider-adapter';
import type {Agent} from '../../src/types';
test('definite provider rejections expose only safe terminal codes, not upstream details',async()=>{
 const original=globalThis.fetch;
 const agent={id:'test',name:'Test',provider:'custom',model:'retired-model'} as Agent;
 try{
  for(const [status,code] of [[404,'PROVIDER_MODEL_UNAVAILABLE'],[402,'PROVIDER_CREDITS_REQUIRED'],[400,'PROVIDER_REQUEST_REJECTED'],[401,'PROVIDER_AUTH_FAILED']] as const){
   globalThis.fetch=async()=>Response.json({error:{message:'synthetic-private-provider-detail',code:status}},{status});
   await assert.rejects(callAIProvider(agent,'Public test',{custom:'synthetic-key'}),(error:any)=>{assert.equal(error.code,code);assert.equal(error.message,code);return true;});
   assert.equal(permanentProviderFailure(code),true);assert.ok(!providerErrorMessage(code).includes('synthetic-private'));
  }
 }finally{globalThis.fetch=original;}
 for(const code of ['PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','PROVIDER_RATE_LIMITED','PROVIDER_EXECUTION_FAILED'])assert.equal(permanentProviderFailure(code),false);
});
