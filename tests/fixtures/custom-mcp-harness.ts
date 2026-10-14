import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function customMcpHarness(mode:'none'|'token'|'oauth'='none') {
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://mcp-db.example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service-role';process.env.JETREE_APP_URL='https://jetree.example.invalid';process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY=Buffer.alloc(32,11).toString('base64');
 const secrets=await import('../../src/lib/server/provider-secrets');const library=await import('../../src/lib/server/custom-mcp-client');
 const user='11000000-0000-4000-8000-000000000001',id='12000000-0000-4000-8000-000000000001',agent='13000000-0000-4000-8000-000000000001';
 const token='synthetic-mcp-private-token';
 const row:any={id,user_id:user,name:'Fixture',url:'https://fixture.mcp.example/mcp',transport:'auto',auth_mode:mode,status:'connected',tools:[],read_only_tools:{},configuration_version:1,lock_ticket:null,lock_until:null,...secrets.encryptProviderSecret(JSON.stringify(mode==='token'?{token}:{}))};
 const states:any[]=[];const approvals:any[]=[];const calls:any[]=[];const networkCalls:any[]=[];let allowAccess=true;
 const matches=(value:any,url:URL)=>[...url.searchParams.entries()].every(([key,filter])=>{
  if(['select','order','limit'].includes(key))return true;
  if(filter.startsWith('eq.'))return String(value[key])===filter.slice(3);
  if(filter.startsWith('neq.'))return String(value[key])!==filter.slice(4);
  if(filter.startsWith('gt.'))return new Date(value[key]).getTime()>new Date(filter.slice(3)).getTime();
  if(filter==='is.null')return value[key]==null;
  return true;
 });
 const original=globalThis.fetch;
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input));assert.equal(url.hostname,'mcp-db.example.invalid');const body=options?.body?JSON.parse(String(options.body)):{};const method=options?.method||'GET';
  if(url.pathname.endsWith('/rpc/lock_custom_mcp_connection')){
   const okay=body.p_user===user&&body.p_connection===id&&row.status!=='revoked'&&!row.lock_ticket;if(okay){row.lock_ticket=body.p_ticket;row.lock_until=new Date(Date.now()+75000).toISOString();}return Response.json(okay);
  }
  if(url.pathname.endsWith('/custom_mcp_connections')){
   const selected=matches(row,url)?[row]:[];if(method==='PATCH')for(const item of selected)Object.assign(item,body);return Response.json(selected);
  }
  if(url.pathname.endsWith('/custom_mcp_oauth_states')){
   if(method==='POST'){states.push(body);return Response.json([body]);}const selected=states.filter(s=>matches(s,url));if(method==='DELETE')for(const item of selected)states.splice(states.indexOf(item),1);return Response.json(selected);
  }
  if(url.pathname.endsWith('/custom_mcp_agent_access'))return Response.json(allowAccess&&matches({connection_id:id,user_id:user,agent_id:agent},url)?[{connection_id:id,user_id:user,agent_id:agent}]:[]);
  if(url.pathname.endsWith('/agents'))return Response.json([{id:agent,enabled_tool_ids:['plugin-custom-mcp'],deleted_at:null}]);
  for(const [name,items] of [['agent_tool_approvals',approvals],['agent_tool_calls',calls]] as const){
   if(url.pathname.endsWith('/'+name)){
    if(method==='POST'){const item={id:randomUUID(),...body};items.push(item);return Response.json([item]);}
    const selected=items.filter(s=>matches(s,url));if(method==='PATCH')for(const item of selected)Object.assign(item,body);return Response.json(selected);
   }
  }
  throw Error('Unexpected DB route');
 };
 let acceptedAccess:string|undefined;let rejectAccess=false;let failRefresh=false;let legacy=false;let streamResponses=false;let streamController:ReadableStreamDefaultController<Uint8Array>|undefined;
 const tool={name:'lookup',description:'Public docs',inputSchema:{type:'object' as const,properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true}};
 const rpcResult=(rpc:any)=>rpc.method==='initialize'?{protocolVersion:rpc.params.protocolVersion,capabilities:{tools:{},resources:{},prompts:{}},serverInfo:{name:'fixture',version:'1'}}:rpc.method==='tools/list'?{tools:[tool]}:rpc.method==='tools/call'?{content:[{type:'text',text:'fixture docs'}]}:rpc.method==='resources/list'?{resources:[{uri:'docs://one',name:'Docs'}]}:rpc.method==='resources/read'?{contents:[{uri:'docs://one',mimeType:'text/plain',text:'resource docs'}]}:rpc.method==='prompts/list'?{prompts:[{name:'guide',arguments:[]}]}:{messages:[{role:'user',content:{type:'text',text:'untrusted guide'}}]};
 const remoteFetch:typeof fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input));const method=options?.method||'GET';const headers=new Headers(options?.headers);networkCalls.push({url:url.href,method,headers,body:options?.body});
  if(url.hostname==='oauth.mcp.example'){
   if(url.pathname==='/token'){
    const params=new URLSearchParams(String(options?.body));assert.equal(params.get('resource'),'https://fixture.mcp.example/mcp');assert.equal(params.get('client_id'),'registered-client');
    if(params.get('grant_type')==='refresh_token'){assert.equal(params.get('refresh_token'),'synthetic-refresh');if(failRefresh)return Response.json({error:'invalid_grant'},{status:400});}
    else {assert.equal(params.get('code'),'synthetic-code');assert.ok(params.get('code_verifier'));}
    rejectAccess=false;acceptedAccess='synthetic-access-'+networkCalls.length;
    return Response.json({access_token:acceptedAccess,refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:'read'});
   }
   if(url.pathname==='/register')return Response.json({client_id:'registered-client',redirect_uris:[process.env.JETREE_APP_URL+'/api/custom-mcp/oauth/callback'],token_endpoint_auth_method:'none'});
   return Response.json({issuer:'https://oauth.mcp.example',authorization_endpoint:'https://oauth.mcp.example/authorize',token_endpoint:'https://oauth.mcp.example/token',registration_endpoint:'https://oauth.mcp.example/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256']});
  }
  assert.equal(url.hostname,'fixture.mcp.example');
  if(url.pathname.includes('.well-known'))return Response.json({resource:'https://fixture.mcp.example/mcp',authorization_servers:['https://oauth.mcp.example'],scopes_supported:['read']});
  if(mode==='token')assert.equal(headers.get('authorization'),'Bearer '+token);
  if(mode==='oauth'&&(!acceptedAccess||rejectAccess||headers.get('authorization')!=='Bearer '+acceptedAccess))return new Response('',{status:401,headers:{'WWW-Authenticate':'Bearer resource_metadata="https://fixture.mcp.example/.well-known/oauth-protected-resource/mcp"'}});
  if(method==='DELETE')return new Response(null,{status:204});
  if(legacy&&url.pathname==='/mcp'&&method==='POST')return new Response('',{status:405});
  if(method==='GET'){
   if(!legacy)return new Response('',{status:405});
   return new Response(new ReadableStream({start(controller){streamController=controller;controller.enqueue(new TextEncoder().encode('event: endpoint\ndata: /messages?session_id=fixture\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}});
  }
  const rpc=JSON.parse(String(options?.body));if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  if(!legacy&&rpc.method!=='initialize')assert.equal(headers.get('mcp-session-id'),'fixture-session');
  const response={jsonrpc:'2.0',id:rpc.id,result:rpcResult(rpc)};
  if(legacy){streamController!.enqueue(new TextEncoder().encode('event: message\ndata: '+JSON.stringify(response)+'\n\n'));return new Response(null,{status:202});}
  return streamResponses?new Response('event: message\ndata: '+JSON.stringify(response)+'\n\n',{headers:{'Content-Type':'text/event-stream','mcp-session-id':'fixture-session'}}):Response.json(response,{headers:{'mcp-session-id':'fixture-session'}});
 };
 return {library,row,user,id,agent,tool,states,approvals,calls,networkCalls,secret:()=>JSON.parse(secrets.decryptProviderSecret(row)),restore:()=>{globalThis.fetch=original;},networkFactory:()=>({fetch:remoteFetch,close:()=>{try{streamController?.close();}catch{}}}),setAccess:(value:boolean)=>{allowAccess=value;},legacy:()=>{legacy=true;},streamResponses:()=>{streamResponses=true;},expire:(fail=false)=>{rejectAccess=true;failRefresh=fail;}};
}
