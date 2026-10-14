import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {customMcpHarness} from '../fixtures/custom-mcp-harness';
test('official MCP client handles JSON and SSE HTTP responses, pinned sessions and bearer credentials',async()=>{
 for(const streaming of [false,true]){
  const h=await customMcpHarness('token');if(streaming)h.streamResponses();
  try{
   const result=await h.library.withMcpClient(h.user,h.id,async(client)=>{
    const tools=await h.library.discoverMcpTools(client);assert.equal(tools[0].name,'lookup');
    const resource=(await client.readResource({uri:'docs://one'})).contents[0];
    assert.ok('text' in resource);assert.equal(resource.text,'resource docs');
    assert.equal((await client.getPrompt({name:'guide'})).messages[0].role,'user');
    return client.callTool({name:'lookup',arguments:{query:'public'}});
   },{networkFactory:h.networkFactory});
   assert.ok('content' in result);assert.equal(h.row.lock_ticket,null);assert.ok(!JSON.stringify(h.row).includes('synthetic-mcp-private-token'));
  }finally{h.restore();}
 }
});
test('legacy SSE endpoint discovery uses the same MCP session without replaying a tool call',async()=>{
 const h=await customMcpHarness('token');h.legacy();
 try{
  const result=await h.library.withMcpClient(h.user,h.id,async client=>{await client.listTools();return client.callTool({name:'lookup',arguments:{query:'public'}});},{networkFactory:h.networkFactory});
  assert.ok('content' in result);assert.equal(h.networkCalls.filter(call=>call.method==='POST'&&String(call.body).includes('tools/call')).length,1);
 }finally{h.restore();}
});
test('OAuth uses PKCE, one-time owned state, fixed resource, encrypted tokens and refresh',async()=>{
 const h=await customMcpHarness('oauth');
 try{
  const start=await h.library.withMcpClient(h.user,h.id,async()=>assert.fail('No tool before consent'),{interactive:true,networkFactory:h.networkFactory});
  assert.ok('authorizationUrl' in start);const url=new URL(start.authorizationUrl);const state=url.searchParams.get('state')!;
  assert.equal(url.origin,'https://oauth.mcp.example');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('resource'),'https://fixture.mcp.example/mcp');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(h.secret().verifier).digest('base64url'));assert.equal(h.states[0].state_hash,h.library.mcpStateHash(state));
  const consumed=await h.library.consumeMcpOAuthState(state);assert.equal(consumed.user_id,h.user);await assert.rejects(h.library.consumeMcpOAuthState(state),/AUTH_REQUIRED/);
  const result=await h.library.withMcpClient(h.user,h.id,async client=>(await client.listTools()).tools.length,{authorizationCode:'synthetic-code',version:consumed.configuration_version,networkFactory:h.networkFactory});
  assert.equal(result,1);assert.ok(h.secret().tokens.issuer);assert.equal(h.secret().verifier,undefined);assert.equal(h.row.status,'connected');
  h.expire();await h.library.withMcpClient(h.user,h.id,async client=>(await client.listTools()).tools.length,{networkFactory:h.networkFactory});
  assert.ok(h.networkCalls.some(call=>call.url.endsWith('/token')&&String(call.body).includes('grant_type=refresh_token')));
  h.expire(true);await assert.rejects(h.library.withMcpClient(h.user,h.id,async()=>assert.fail('No tool with expired grant'),{networkFactory:h.networkFactory}),/MCP_AUTH_REQUIRED/);assert.equal(h.row.status,'auth_required');
  const oldVersion=h.row.configuration_version;h.row.read_only_tools.lookup='old-account-policy';
  const renewed=await h.library.withMcpClient(h.user,h.id,async()=>assert.fail('No tool before fresh consent'),{interactive:true,networkFactory:h.networkFactory});
  assert.ok('authorizationUrl' in renewed);assert.equal(h.row.configuration_version,oldVersion+1);assert.deepEqual(h.row.read_only_tools,{},'Consent clears old permissions even after invalid_grant erased tokens');
 }finally{h.restore();}
});
test('owner, assignment and exact schema permissions are checked before creating an approval',async()=>{
 const h=await customMcpHarness('none');
 try{
  const {prepareCustomMcpRequest}=await import('../../src/lib/server/custom-mcp-tools');
  h.row.tools=[h.tool];const req=()=>({operation:'call_mcp_tool' as const,input:{serverId:h.id,name:'lookup',arguments:{query:'public'}},write:true});
  const prepared=await prepareCustomMcpRequest(h.user,h.agent,req());assert.equal(prepared.write,true,'Server readOnlyHint cannot grant access');
  await assert.rejects(prepareCustomMcpRequest('foreign-user',h.agent,req()),/NOT_AUTHORIZED/);
  h.row.read_only_tools.lookup=h.library.mcpDefinitionHash(h.tool);assert.equal((await prepareCustomMcpRequest(h.user,h.agent,req())).write,false);
  h.row.tools[0]={...h.tool,description:'changed'};assert.equal((await prepareCustomMcpRequest(h.user,h.agent,req())).write,true,'Changed metadata invalidates automatic reading');
  await assert.rejects(prepareCustomMcpRequest(h.user,h.agent,prepared,true),/APPROVAL_NOT_PENDING/);
  h.setAccess(false);await assert.rejects(prepareCustomMcpRequest(h.user,h.agent,req()),/NOT_AUTHORIZED/);
 }finally{h.restore();}
});
