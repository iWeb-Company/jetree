import {Worker} from 'node:worker_threads';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {boundedMcpJson} from '@/lib/custom-mcp-contract';

let active=0;
export async function validateMcpSchema(schema: Record<string,unknown>,value:unknown) {
  boundedMcpJson(schema,16000);boundedMcpJson(value,32000);
  if(typeof Ajv2020!=='function')throw new Error('SERVER_CONFIGURATION_ERROR');
  if(active>=4)throw new Error('MCP_BUSY');active++;
  try {
    const valid=await new Promise<boolean>(resolve=>{
      const worker=new Worker(path.join(process.cwd(),'scripts/mcp-schema-worker.mjs'),{workerData:{schema,value},resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:8,stackSizeMb:2}});
      const finish=(result:boolean)=>{clearTimeout(timer);void worker.terminate();resolve(result);};
      const timer=setTimeout(()=>finish(false),1500);
      worker.once('message',result=>finish(result===true));worker.once('error',()=>finish(false));worker.once('exit',()=>finish(false));
    });
    if(!valid)throw new Error('MCP_SCHEMA_INVALID');
  } finally {active--;}
}
