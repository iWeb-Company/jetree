import test from 'node:test';
import assert from 'node:assert/strict';
import {needsImageHistory} from '../../src/lib/chat-images';
import {executeImageChat} from '../../src/lib/server/image-chat';
import type {Agent} from '../../src/types';
const agent:Agent={id:'test',name:'Test',departmentId:'test',description:'',roleType:'independent',provider:'custom',model:'text-only:free',systemPrompt:'',status:'idle',enabledPluginIds:['plugin-custom-mcp']};
const picture={bytes:Buffer.from('old-image'),mimeType:'image/png'};
const request='Usá el MCP Cloudflare docs · prueba dev para buscar Cloudflare Workers getting started documentation. Consultá solo documentación pública y esperá aprobación';
test('historical image context is opt-in by reference, not by previous attachments or image product names',()=>{
 for(const text of [request,'Buscá documentación de Cloudflare Images','Mostrame los últimos correos','Qué modelo genera imágenes?','No generes una imagen'])assert.equal(needsImageHistory(text),false,text);
 for(const text of ['Qué se veía en la imagen anterior?','Describí esta foto','What was in the previous image?','Y de qué color es?','Generá una imagen de un gato'])assert.equal(needsImageHistory(text),true,text);
 assert.equal(needsImageHistory('un gato',true),true);
});
test('MCP text requests with old images use text inference and create the actual approval',async()=>{
 let calls=0;const result=await executeImageChat([agent,request,[],[],{},async()=>{calls++;return JSON.stringify({toolId:'plugin-custom-mcp',operation:'call_mcp_tool',input:{serverId:'11111111-1111-4111-8111-111111111111',name:'search_docs',arguments:{query:'Workers'}}});},undefined,async()=>({pendingApproval:true,approvalId:'test-approval'})],[picture],false);
 assert.equal(calls,1);assert.match(result.reply,/pendiente de tu aprobación/);assert.doesNotMatch(result.reply,/Consejo de modelos/);
});
test('a newly received image and explicit historical references still use vision',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.ok(body.messages[0].content.some((part:any)=>part.type==='image_url'));return Response.json({choices:[{message:{content:'Vision OK'}}]});};
 try{
  for(const [text,received] of [['Describí esto',true],['Qué se veía en la imagen anterior?',false]] as const){
   const result=await executeImageChat([{...agent,enabledPluginIds:[]},text,[],[],{custom:'synthetic-secret'}],[picture],received);assert.match(result.reply,/Vision OK/);
  }
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
