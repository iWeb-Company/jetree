import test from 'node:test';
import assert from 'node:assert/strict';
import { codingModels,codingReport,codingId } from '../../src/lib/coding-contract';
test('coding reports require actual verification and safe relative diff names',()=>{
  const value={state:'ready_for_review',files:[{name:'src/sum.js',status:'modified',diff:'small diff',sensitive:false}],summary:'done',verification:{command:'node --test',exitCode:0,output:'passed'},untrusted:'ignored'};
  assert.equal(codingReport(value,'node --test').verification.exitCode,0);
  assert.throws(()=>codingReport({...value,verification:{...value.verification,exitCode:1}},'node --test'),/CODING_REPORT_INVALID/);
  assert.throws(()=>codingReport(value,'other command'),/CODING_REPORT_INVALID/);
  assert.throws(()=>codingReport({...value,files:[{name:'../private',status:'added'}]},'node --test'),/CODING_REPORT_INVALID/);
  assert.equal(codingReport({...value,files:[{name:'private.js',status:'modified',sensitive:true,diff:'never display'}]},'node --test').files[0].diff,undefined);
});
test('coding model and IDs reject foreign execution parameters',()=>{
  assert.throws(()=>codingModels([{provider:'groq',model:'../escape'}]),/CODING_INPUT_INVALID/);
  assert.throws(()=>codingModels([{provider:'arbitrary',model:'demo'}]),/CODING_INPUT_INVALID/);
  assert.throws(()=>codingId('user controlled query'),/CODING_INPUT_INVALID/);
  assert.deepEqual(codingModels([{provider:'openrouter',model:'openrouter/free',baseURL:'https://evil.invalid'}]),[{provider:'openrouter',model:'openrouter/free'}]);
});
