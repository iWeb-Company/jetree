import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpUrl,publicMcpAddress,resolveMcpAddress,mcpNetwork} from '../../src/lib/server/custom-mcp-network';
import {parseCustomMcpInput,boundedMcpJson} from '../../src/lib/custom-mcp-contract';
import {validateMcpSchema} from '../../src/lib/server/custom-mcp-schema';
import {normalizeMcpTools,mcpDefinitionHash,redactMcpResult,assertMcpCatalogSafe,safeMcpError} from '../../src/lib/server/custom-mcp-client';
import {respondWithTools} from '../../src/lib/agents/tool-loop';
import {parseToolRequest} from '../../src/lib/agents/tool-catalog';
const id='11111111-1111-4111-8111-111111111111';
test('MCP URLs reject private, mapped, numeric, credential and non-HTTP targets',async()=>{
 for(const url of ['http://public.example/mcp','file:///etc/passwd','https://localhost/mcp','https://127.0.0.1/mcp','https://2130706433/mcp','https://[::ffff:127.0.0.1]/mcp','https://10.0.0.1/mcp','https://169.254.169.254/mcp','https://100.64.0.1/mcp','https://user:secret@public.example/mcp','https://public.example/mcp?token=private'])assert.throws(()=>mcpUrl(url));
 for(const ip of ['0.0.0.0','127.0.0.1','10.0.0.1','192.168.0.1','172.16.0.1','::1','fc00::1','fe80::1','2001:db8::1'])assert.equal(publicMcpAddress(ip),false,ip);
 assert.equal(publicMcpAddress('1.1.1.1'),true);
 await assert.rejects(resolveMcpAddress(new URL('https://public.example/mcp'),(async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]) as any),/ADDRESS_DENIED/);
});
test('MCP HTTP fetch pins a checked address, denies redirects and bounds streaming bytes',async()=>{
 const resolver=async()=>[{address:'1.1.1.1',family:4}];let calls=0;
 const net=mcpNetwork(new AbortController().signal,{resolver:resolver as any,fetcher:(async(_url:any,options:any)=>{calls++;assert.equal(options.redirect,'manual');assert.ok(options.dispatcher);return new Response(null,{status:302,headers:{Location:'https://127.0.0.1'}});}) as any});
 await assert.rejects(net.fetch('https://public.example/mcp'),/REDIRECT_DENIED/);net.close();assert.equal(calls,1);
 const huge=mcpNetwork(new AbortController().signal,{resolver:resolver as any,fetcher:(async()=>new Response(new Uint8Array(2*1024*1024+1))) as any});
 await assert.rejects((await huge.fetch('https://public.example/mcp')).text(),/RESPONSE_TOO_LARGE/);huge.close();
});
test('custom calls default to approval and cannot select endpoints, paths or credentials',()=>{
 const parsed=parseToolRequest('plugin-custom-mcp','call_mcp_tool',{serverId:id,name:'lookup',arguments:{query:'public'},url:'https://evil.example',token:'private'});
 assert.equal(parsed.write,true);assert.deepEqual(parsed.input,{serverId:id,name:'lookup',arguments:{query:'public'}});
 assert.equal(parseCustomMcpInput('list_mcp_servers',{}).write,false);
 assert.throws(()=>parseCustomMcpInput('call_mcp_tool',{serverId:'foreign',name:'lookup',arguments:{}}));assert.throws(()=>parseCustomMcpInput('exec_shell',{serverId:id}));
 let deep:any={};for(let n=0;n<25;n++)deep={next:deep};assert.throws(()=>boundedMcpJson(deep));
});
test('catalog hashes bind definitions and secrets are redacted in keys and values',()=>{
 const tools=normalizeMcpTools([{name:'lookup',description:'look up public docs',inputSchema:{type:'object',properties:{query:{type:'string'}}},annotations:{readOnlyHint:true}}]);
 assert.notEqual(mcpDefinitionHash(tools[0]),mcpDefinitionHash({...tools[0],description:'changed'}));
 const secret={token:'synthetic-private-credential'};const result=redactMcpResult({[secret.token]:secret.token,content:[{type:'image',data:'private binary'}]},secret);
 assert.ok(!JSON.stringify(result).includes(secret.token));assert.ok(!JSON.stringify(result).includes('private binary'));
 assert.throws(()=>assertMcpCatalogSafe([{...tools[0],description:secret.token}],secret));assert.equal(safeMcpError(new Error('MCP_SYNTHETIC_PRIVATE_CREDENTIAL')).message,'MCP_CONNECTION_FAILED');
});
test('schema workers do not block the app on malicious regex',async()=>{
 const schema={type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false};
 await validateMcpSchema(schema,{query:'public'});await assert.rejects(validateMcpSchema(schema,{other:'wrong'}),/SCHEMA_INVALID/);
 const started=Date.now();await assert.rejects(validateMcpSchema({type:'string',pattern:'^(a+)+$'},'a'.repeat(1000)+'!'),/SCHEMA_INVALID/);assert.ok(Date.now()-started<4000);
});
test('managers and independent agents discover MCP by intent and stop at approval',async()=>{
 for(const role of ['manager','independent']){
  const agent={id,role,enabledPluginIds:['plugin-custom-mcp']} as any;let step=0;const calls:any[]=[];
  const decisions=[{toolId:'plugin-custom-mcp',operation:'list_mcp_servers',input:{}},{toolId:'plugin-custom-mcp',operation:'list_mcp_tools',input:{serverId:id,search:'docs'}},{toolId:'plugin-custom-mcp',operation:'call_mcp_tool',input:{serverId:id,name:'lookup',arguments:{query:'workers'}}}];
  const answer=await respondWithTools(agent,'Buscá documentación del servicio conectado.',{},async()=>JSON.stringify(decisions[step++]),async(_agent,tool,operation,input)=>{calls.push([tool,operation,input]);return operation==='call_mcp_tool'?{pendingApproval:true,approvalId:id}:{result:{name:'lookup',serverId:id}};});
  assert.equal(calls.length,3);assert.match(answer,/pendiente de tu aprobación/);
 }
});
