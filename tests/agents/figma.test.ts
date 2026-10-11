import test from 'node:test';
import assert from 'node:assert/strict';
import { figmaFileKey, parseFigmaCommands, parseFigmaInput } from '../../src/lib/figma-contract';
import { assertToolEnabled, parseToolRequest } from '../../src/lib/agents/tool-catalog';
import { boundedFigmaBody, compactFigmaNode, figmaApi, renderFigmaNode } from '../../src/lib/server/figma-rest';
import { conversationToolGuidance } from '../../src/lib/agents/tool-loop';
import type { Agent } from '../../src/types';

test('Figma URLs only resolve official Design files, never arbitrary hosts or FigJam',()=>{
  assert.equal(figmaFileKey('https://www.figma.com/design/Abc123XYZ/Test?node-id=1-2'),'Abc123XYZ');
  for(const value of ['https://figma.com.evil.test/design/Abc123XYZ/a','http://figma.com/file/Abc123XYZ','https://user@figma.com/file/Abc123XYZ','https://figma.com:444/file/Abc123XYZ','https://figma.com/board/Abc123XYZ/a','../files/Abc123XYZ']) assert.throws(()=>figmaFileKey(value),/TOOL_INPUT_INVALID/);
});
test('Figma write operations require approval and an enabled connector for every provider',()=>{
  assert.throws(()=>assertToolEnabled([], 'plugin-figma-core'),/TOOL_NOT_AUTHORIZED/);
  assert.equal(parseToolRequest('plugin-figma-core','get_figma_file',{fileKey:'Abc123XYZ'}).write,false);
  assert.equal(parseToolRequest('plugin-figma-core','apply_figma_changes',{fileKey:'Abc123XYZ',summary:'Actualizar texto',commands:[{op:'update_node',nodeId:'1:2',props:{characters:'Hola'}}]}).write,true);
  assert.equal(parseFigmaInput('post_figma_comment',{fileKey:'Abc123XYZ',message:'Revisar'}).write,true);
  assert.throws(()=>parseFigmaInput('run_javascript',{code:'deleteEverything()'}),/TOOL_NOT_SUPPORTED/);
});
test('Figma batches reject executable code, unknown properties, forward refs, duplicated refs and invalid dimensions',()=>{
  const invalid:unknown[]=[[],Array(26).fill({op:'delete_node',nodeId:'1:2'}),[{op:'eval',code:'figma.root.remove()'}],[{op:'create_frame',props:{__proto__:null,arbitraryJS:'foo'}}],[{op:'create_text',parentId:'$later'}],[{op:'create_frame',ref:'$a'},{op:'create_text',ref:'$a'}],[{op:'update_node',nodeId:'1:2',props:{width:0}}],[{op:'update_node',nodeId:'1:2',props:{x:Infinity}}],[{op:'delete_node',nodeId:'0:0',props:{name:'root'}}],[{op:'move_node',nodeId:'1:2'}]];
  for(const commands of invalid)assert.throws(()=>parseFigmaCommands(commands),/TOOL_INPUT_INVALID/);
  const parsed=parseFigmaCommands([{op:'create_frame',ref:'$frame',props:{width:300,height:200,layoutMode:'VERTICAL',padding:16}},{op:'create_text',parentId:'$frame',props:{characters:'Título'}}]);
  assert.equal(parsed[1].parentId,'$frame');
});
test('Figma vision accepts one real node and normalizes URL node IDs',()=>{
  assert.deepEqual(parseFigmaInput('inspect_figma',{fileKey:'Abc123XYZ',nodeIds:['1-2']}).input.nodeIds,['1:2']);
  assert.throws(()=>parseFigmaInput('inspect_figma',{fileKey:'Abc123XYZ',nodeIds:['1:2','3:4']}),/TOOL_INPUT_INVALID/);
});
test('Figma REST uses the fixed API host, PAT header and no redirects',async()=>{
  const fake=(async(url:any,options:any)=>{assert.equal(String(url),'https://api.figma.com/v1/files/Abc123XYZ?depth=2');assert.equal(options.headers['X-Figma-Token'],'synthetic-rest-unique');assert.equal(options.redirect,'error');return Response.json({name:'Design',document:{id:'0:0'}});}) as typeof fetch;
  await figmaApi('synthetic-rest-unique','/files/Abc123XYZ?depth=2','GET',undefined,fake);
  await assert.rejects(figmaApi('synthetic','/files/../../private','GET',undefined,fake),/TOOL_INPUT_INVALID/);
});
test('Figma honors Retry-After and stops repeated calls for a throttled token',async()=>{
  let count=0;const fake=(async()=>{count++;return new Response(null,{status:429,headers:{'retry-after':'60'}});}) as typeof fetch;
  await assert.rejects(figmaApi('synthetic-throttled','/me','GET',undefined,fake),/TOOL_PROVIDER_RATE_LIMITED/);
  await assert.rejects(figmaApi('synthetic-throttled','/me','GET',undefined,fake),/TOOL_PROVIDER_RATE_LIMITED/);assert.equal(count,1);
});
test('Figma response streaming rejects oversized bodies even without Content-Length',async()=>{
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(101));controller.close();}}));
  await assert.rejects(boundedFigmaBody(response,100),/FIGMA_RESPONSE_TOO_LARGE/);
});
test('Figma export rejects asset URLs outside its fixed image hosts before fetching',async()=>{
  let count=0;const fake=(async()=>{count++;return Response.json({images:{'1:2':'https://169.254.169.254/latest/meta-data'}});}) as typeof fetch;
  await assert.rejects(renderFigmaNode('synthetic-asset','Abc123XYZ','1:2',fake),/FIGMA_RENDER_FAILED/);assert.equal(count,1);
});
test('Figma structures are bounded and conversation guidance identifies designs and queued edits',()=>{
  const node:any=compactFigmaNode({id:'0:0',children:Array.from({length:200},(_,i)=>({id:`1:${i}`,characters:'text'}))});assert.equal(node.children.length,50);assert.equal(node.truncated,true);
  const agent={enabledPluginIds:['plugin-figma-core']} as Agent;assert.match(conversationToolGuidance(agent),/get_figma_jobs/);assert.match(conversationToolGuidance(agent),/inspect_figma/);
});
