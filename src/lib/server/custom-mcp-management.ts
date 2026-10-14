import {getServiceSupabase} from './auth';
import {encryptProviderSecret} from './provider-secrets';
import {mcpUrl,resolveMcpAddress} from './custom-mcp-network';
import {withMcpClient,discoverMcpTools,mcpDefinitionHash,ownedMcpConnection,assertMcpCatalogSafe,type McpSecret} from './custom-mcp-client';
import {mcpText,mcpUuid,CUSTOM_MCP_ID} from '@/lib/custom-mcp-contract';
import type {SupabaseClient} from '@supabase/supabase-js';

export async function createCustomMcpConnection(userId:string,body:any) {
  const db=getServiceSupabase();const name=mcpText(body.name,100);const url=mcpUrl(mcpText(body.url,2048));await resolveMcpAddress(url);
  const authMode=body.authMode;const transport=body.transport||'auto';
  if(!['none','token','oauth'].includes(authMode)||!['auto','streamable_http','sse'].includes(transport))throw new Error('TOOL_INPUT_INVALID');
  const secret:McpSecret={};
  if(authMode==='oauth'&&body.clientSecret&&!body.clientId)throw new Error('TOOL_INPUT_INVALID');
  if(authMode==='token'){
    secret.token=mcpText(body.token,8192);secret.headerName=mcpText(body.headerName||'Authorization',64);
    if(!/^[A-Za-z][A-Za-z0-9-]*$/.test(secret.headerName)||/^(host|cookie|origin|referer|connection|content-.+|accept|proxy-.+|mcp-.+|sec-.+)$/i.test(secret.headerName))throw new Error('MCP_HEADER_INVALID');
  }
  if(authMode==='oauth'&&body.clientId){
    const issuer=mcpUrl(mcpText(body.issuer,2048));await resolveMcpAddress(issuer);
    secret.client={client_id:mcpText(body.clientId,2048),issuer:mcpText(body.issuer,2048),...(body.clientSecret?{client_secret:mcpText(body.clientSecret,8192)}:{})};
  }
  const {count,error:countError}=await db.from('custom_mcp_connections').select('id',{count:'exact',head:true}).eq('user_id',userId).neq('status','revoked');
  if(countError)throw new Error('MCP_STORAGE_FAILED');if((count||0)>=20)throw new Error('MCP_CONNECTION_LIMIT');
  const {data,error}=await db.from('custom_mcp_connections').insert({user_id:userId,name,url:url.href,auth_mode:authMode,transport,...encryptProviderSecret(JSON.stringify(secret))}).select('id').single();
  if(error||!data)throw new Error('MCP_STORAGE_FAILED');return data.id as string;
}
export async function refreshCustomMcpConnection(userId:string,id:string,options:{interactive?:boolean;authorizationCode?:string;version?:number}={}) {
  return withMcpClient(userId,id,async(client,connection,secret)=>{
    const tools=await discoverMcpTools(client);assertMcpCatalogSafe(tools,secret);const capabilities=client.getServerCapabilities();
    const {error}=await getServiceSupabase().from('custom_mcp_connections').update({tools,capabilities:{tools:Boolean(capabilities?.tools),resources:Boolean(capabilities?.resources),prompts:Boolean(capabilities?.prompts)}}).eq('id',id).eq('user_id',userId).eq('configuration_version',connection.configuration_version).neq('status','revoked');
    if(error)throw new Error('MCP_STORAGE_FAILED');return {id,tools:tools.length};
  },options);
}
export async function assignCustomMcpConnection(client:SupabaseClient,userId:string,body:any) {
  const id=mcpUuid(body.id);const agentId=mcpUuid(body.agentId);await ownedMcpConnection(userId,id);
  if(typeof body.enabled!=='boolean')throw new Error('TOOL_INPUT_INVALID');
  const db=getServiceSupabase();
  if(!body.enabled){const {error}=await db.from('custom_mcp_agent_access').delete().eq('connection_id',id).eq('user_id',userId).eq('agent_id',agentId);if(error)throw new Error('MCP_STORAGE_FAILED');return;}
  const {data:agent,error}=await client.from('agents').select('id,department_id,enabled_tool_ids').eq('id',agentId).is('deleted_at',null).maybeSingle();
  if(error||!agent)throw new Error('TOOL_NOT_AUTHORIZED');
  const {data:department}=await client.from('departments').select('id').eq('id',agent.department_id).is('deleted_at',null).maybeSingle();if(!department)throw new Error('TOOL_NOT_AUTHORIZED');
  const enabled=Array.isArray(agent.enabled_tool_ids)?agent.enabled_tool_ids:[];
  const {data:changed,error:changeError}=await client.from('agents').update({enabled_tool_ids:[...new Set([...enabled,CUSTOM_MCP_ID])],updated_at:new Date().toISOString()}).eq('id',agentId).select('id').maybeSingle();
  if(changeError||!changed)throw new Error('TOOL_NOT_AUTHORIZED');
  const {error:accessError}=await db.from('custom_mcp_agent_access').upsert({connection_id:id,user_id:userId,agent_id:agentId});if(accessError)throw new Error('MCP_STORAGE_FAILED');
}
export async function setCustomMcpReadOnly(userId:string,id:string,names:unknown) {
  if(!Array.isArray(names)||names.length>500||names.some(name=>typeof name!=='string'))throw new Error('TOOL_INPUT_INVALID');
  const connection=await ownedMcpConnection(userId,id);
  const tools=names.map(name=>{const tool=connection.tools.find(t=>t.name===name);if(!tool)throw new Error('TOOL_INPUT_INVALID');return tool;});
  const {error}=await getServiceSupabase().from('custom_mcp_connections').update({read_only_tools:Object.fromEntries(tools.map(t=>[t.name,mcpDefinitionHash(t)]))}).eq('id',id).eq('user_id',userId).neq('status','revoked');
  if(error)throw new Error('MCP_STORAGE_FAILED');
}
export async function revokeCustomMcpConnection(userId:string,id:string) {
  await ownedMcpConnection(userId,id);const db=getServiceSupabase();
  const {error}=await db.from('custom_mcp_connections').update({status:'revoked',...encryptProviderSecret('{}'),tools:[],read_only_tools:{},configuration_version:2,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId);
  if(error)throw new Error('MCP_STORAGE_FAILED');
  await db.from('custom_mcp_agent_access').delete().eq('connection_id',id).eq('user_id',userId);
  await db.from('custom_mcp_oauth_states').delete().eq('connection_id',id).eq('user_id',userId);
}
