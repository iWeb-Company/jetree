import test from 'node:test';
import assert from 'node:assert/strict';
import {activityCollector,eventReaderScript} from '../activity.mjs';
import {gateway} from '../gateway.mjs';
test('Jetree broker sends only a job credential to its pinned HTTPS inference endpoint',async t=>{
 const calls=[];
 for(const proxyUrl of ['http://remote.test/api/coding-inference','https://remote.test/other','https://user:password@remote.test/api/coding-inference'])assert.throws(()=>gateway({provider:'gemini',model:'chosen',key:'job-token',token:'engine-token',proxyUrl}));
 const server=gateway({provider:'gemini',model:'chosen',key:'job-token',token:'engine-token',proxyUrl:'https://jetree.test/api/coding-inference',fetcher:async(url,options)=>{calls.push({url,options});return Response.json({choices:[]});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();server.closeAllConnections();});
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer engine-token'},body:JSON.stringify({model:'chosen',messages:[{role:'user',content:'hello'}],baseURL:'https://evil.test',api_key:'stolen'})});
 assert.equal(response.status,200);assert.equal(calls[0].url,'https://jetree.test/api/coding-inference');assert.equal(calls[0].options.headers.Authorization,'Bearer job-token');assert.equal(calls[0].options.redirect,'error');assert.ok(!calls[0].options.body.includes('stolen')&&!calls[0].options.body.includes('evil.test'));
});
test('activity emits tool transitions once, redacts credentials and excludes reasoning',()=>{
 const events=[];const collect=activityCollector(e=>events.push(e),['private-key']);
 collect({id:'hidden',type:'reasoning',text:'secret thinking'});
 const part={id:'tool',type:'tool',tool:'bash',state:{status:'running',input:{command:'echo private-key'}}};
 collect(part);collect(part);collect({...part,state:{...part.state,status:'completed',output:'Bearer private-value'}});
 collect({id:'message',type:'text',text:'done',time:{end:1}});
 assert.equal(events.length,3);assert.ok(!JSON.stringify(events).includes('private-key'));assert.ok(!JSON.stringify(events).includes('private-value'));assert.ok(!JSON.stringify(events).includes('secret thinking'));
});
test('SSE reader filters unrelated sessions and reasoning before output',async()=>{
 const outputs=[];const encoder=new TextEncoder();
 const frames=[{type:'message.part.updated',properties:{part:{id:'a',sessionID:'session',type:'text',text:'visible',time:{end:1}}}},{type:'message.part.updated',properties:{part:{id:'b',sessionID:'session',type:'reasoning',text:'hidden'}}},{type:'message.part.updated',properties:{part:{id:'c',sessionID:'other',type:'text',text:'other'}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('fetch','process','console','Buffer','TextDecoder','AbortSignal',eventReaderScript.replace("fetch('http", "return fetch('http"))(
 async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(encoder.encode(frames.slice(0,10)));c.enqueue(encoder.encode(frames.slice(10)));c.close();}})}),{argv:['node','session'],env:{OPENCODE_SERVER_PASSWORD:'private'},exit:()=>{throw Error('exit');}},{log:s=>outputs.push(JSON.parse(s))},Buffer,TextDecoder,AbortSignal);
 assert.equal(outputs.length,2);assert.equal(outputs[1].text,'visible');
});
