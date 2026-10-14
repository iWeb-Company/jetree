import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
const worker=new Worker(new URL('./mcp-schema-worker.mjs',import.meta.url),{workerData:{schema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},value:{query:'synthetic'}}});
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{void worker.terminate();reject(Error('Validator timed out'));},5000);worker.once('message',valid=>{clearTimeout(timer);try{assert.equal(valid,true);resolve();}catch(e){reject(e);}});worker.once('error',reject);});
await worker.terminate();console.log('PASS production MCP schema worker and traced AJV dependency');
