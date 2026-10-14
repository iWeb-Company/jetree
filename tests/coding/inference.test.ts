import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceToken,verifyInferenceToken,inferenceInput,inferenceEndpoints} from '../../src/lib/server/coding-inference';
import {codingActivity} from '../../src/lib/coding-activity';

test('inference authorization is bound to the claim and expires without exposing a provider key',()=>{
  process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
  const job='11111111-1111-4111-8111-111111111111',claim='22222222-2222-4222-8222-222222222222',now=1800000000000;
  const token=inferenceToken(job,claim,now);
  assert.deepEqual(verifyInferenceToken(token,now),{jobId:job,claimId:claim});
  assert.throws(()=>verifyInferenceToken(token.replace('22222222','33333333'),now));
  assert.throws(()=>verifyInferenceToken(token,now+480000));
  assert.throws(()=>verifyInferenceToken(token.slice(0,-1),now));
});
test('all six providers accept only the chosen model and bounded text protocol',()=>{
  for(const provider of Object.keys(inferenceEndpoints)) {
    const input=inferenceInput({model:'chosen',messages:[{role:'user',content:[{type:'text',text:'hello'}],secret:'hidden'}],stream:true,temperature:1,api_key:'hidden',baseURL:'https://evil.test',max_tokens:99999},provider,'chosen');
    assert.deepEqual(input.messages,[{role:'user',content:'hello'}]);
    assert.equal(input.model,'chosen');assert.equal(input.tool_choice,'auto');
    assert.equal(input[provider==='openai'?'max_completion_tokens':'max_tokens'],4096);
    assert.ok(!('api_key' in input)&&!('baseURL' in input)&&!('temperature' in input));
    assert.throws(()=>inferenceInput({model:'other',messages:[]},provider,'chosen'));
    assert.throws(()=>inferenceInput({model:'chosen',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://evil.test'}}]}]},provider,'chosen'));
  }
});
test('activity rejects invalid batches and removes secrets and hidden fields',()=>{
  const [event]=codingActivity([{sequence:1,kind:'tool',status:'completed',label:'bash',output:'Bearer private-value api_key=private-value',reasoning:'private reasoning'}]);
  assert.ok(!event.output?.includes('private-value'));assert.ok(!('reasoning' in event));
  assert.throws(()=>codingActivity([{sequence:501,kind:'tool',status:'completed',label:'bash'}]));
  assert.throws(()=>codingActivity([{sequence:1,kind:'reasoning',status:'completed',label:'hidden'}]));
  assert.throws(()=>codingActivity(Array(21).fill(event)));
  const [unicode]=codingActivity([{sequence:1,kind:'message',status:'completed',label:'界'.repeat(600),output:'界'.repeat(4096)}]);
  assert.ok(Buffer.byteLength(JSON.stringify(unicode))<7000,'Unicode output fits the database byte limit');
});
