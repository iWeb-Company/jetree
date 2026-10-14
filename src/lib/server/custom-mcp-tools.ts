import {getServiceSupabase} from './auth';
import {createHash} from 'node:crypto';
import {CUSTOM_MCP_ID,type CustomMcpOperation,type CustomMcpTool} from '@/lib/custom-mcp-contract';
import {ownedMcpConnection,withMcpClient,discoverMcpTools,mcpDefinitionHash,redactMcpResult,assertMcpCatalogSafe,type McpConnection} from './custom-mcp-client';
import {validateMcpSchema} from './custom-mcp-schema';

async function assignedConnection(userId:string,agentId:string,id:string):Promise<McpConnection> {
  const db=getServiceSupabase();const {data,error}=await db.from('custom_mcp_agent_access').select('connection_id').eq('connection_id',id).eq('user_id',userId).eq('agent_id',agentId).maybeSingle();
  if(error||!data)throw new Error('TOOL_NOT_AUTHORIZED');const connection=await ownedMcpConnection(userId,id);
  if(connection.status!=='connected')throw new Error('MCP_AUTH_REQUIRED');return connection;
}
export async function prepareCustomMcpRequest(userId:string,agentId:string,request:{operation:CustomMcpOperation;input:Record<string,unknown>;write:boolean},approved=false) {
  if(request.operation==='list_mcp_servers')return request;
  const c=await assignedConnection(userId,agentId,String(request.input.serverId));
  let definitionHash=createHash('sha256').update(request.operation).digest('hex');
  if(request.operation==='call_mcp_tool'){
    const tool=c.tools.find(t=>t.name===request.input.name);if(!tool)throw new Error('TOOL_NOT_SUPPORTED');
    definitionHash=mcpDefinitionHash(tool);await validateMcpSchema(tool.inputSchema,request.input.arguments);
    request.write=c.read_only_tools[tool.name]!==definitionHash;
  }
  if(['call_mcp_tool','read_mcp_resource','get_mcp_prompt'].includes(request.operation)){
    if(approved&&(request.input._configurationVersion!==c.configuration_version||request.input._definitionHash!==definitionHash))throw new Error('TOOL_APPROVAL_NOT_PENDING');
    request.input={...request.input,_configurationVersion:c.configuration_version,_definitionHash:definitionHash};
  }
  return request;
}
const page=(items:any[],input:Record<string,unknown>,size:number)=>{
  const search=String(input.search||'').toLowerCase();const filtered=items.filter(item=>!search||JSON.stringify([item.name,item.description,item.uri]).toLowerCase().includes(search));
  const offset=Number(input.offset||0);return {items:filtered.slice(offset,offset+size),nextOffset:offset+size<filtered.length?offset+size:null,total:filtered.length};
};
export async function executeCustomMcpTool(userId:string,agentId:string,operation:CustomMcpOperation,input:Record<string,unknown>,approved=false) {
  const db=getServiceSupabase();
  if(operation==='list_mcp_servers'){
    const {data:access,error}=await db.from('custom_mcp_agent_access').select('connection_id').eq('user_id',userId).eq('agent_id',agentId).limit(20);
    if(error)throw new Error('MCP_STORAGE_FAILED');if(!access?.length)return {servers:[],hint:'Asigná un servidor MCP al agente desde Herramientas.'};
    const {data:connections,error:connError}=await db.from('custom_mcp_connections').select('id,name,status').eq('user_id',userId).in('id',access.map(a=>a.connection_id)).neq('status','revoked');
    if(connError)throw new Error('MCP_STORAGE_FAILED');return {servers:connections,toolId:CUSTOM_MCP_ID};
  }
  const id=String(input.serverId);const assigned=await assignedConnection(userId,agentId,id);
  if(operation==='list_mcp_tools')return page(assigned.tools.map(tool=>({...tool,approvalRequired:assigned.read_only_tools[tool.name]!==mcpDefinitionHash(tool)})),input,1);
  const result=await withMcpClient(userId,id,async(client,connection,secret)=>{
    const current=await assignedConnection(userId,agentId,id);
    if(['call_mcp_tool','read_mcp_resource','get_mcp_prompt'].includes(operation)){
      if(current.configuration_version!==input._configurationVersion||connection.configuration_version!==input._configurationVersion)throw new Error('MCP_CATALOG_CHANGED');
      if(operation!=='call_mcp_tool'&&!approved)throw new Error('TOOL_APPROVAL_NOT_PENDING');
    }
    if(operation==='call_mcp_tool'){
      const tools=await discoverMcpTools(client);assertMcpCatalogSafe(tools,secret);const tool=tools.find(t=>t.name===input.name);
      if(!tool||mcpDefinitionHash(tool)!==input._definitionHash||connection.configuration_version!==input._configurationVersion)throw new Error('MCP_CATALOG_CHANGED');
      if(!approved&&current.read_only_tools[tool.name]!==mcpDefinitionHash(tool))throw new Error('TOOL_APPROVAL_NOT_PENDING');
      await validateMcpSchema(tool.inputSchema,input.arguments);
      const latest=await assignedConnection(userId,agentId,id);
      if(latest.configuration_version!==input._configurationVersion)throw new Error('MCP_CATALOG_CHANGED');
      if(!approved&&latest.read_only_tools[tool.name]!==mcpDefinitionHash(tool))throw new Error('TOOL_APPROVAL_NOT_PENDING');
      const response=await client.callTool({name:tool.name,arguments:input.arguments as Record<string,unknown>},undefined,{timeout:20000});
      if(response.isError)throw new Error('MCP_TOOL_FAILED');
      if(tool.outputSchema)await validateMcpSchema(tool.outputSchema,response.structuredContent);
      return redactMcpResult(response,secret);
    }
    if(operation==='read_mcp_resource')return redactMcpResult(await client.readResource({uri:String(input.uri)},{timeout:15000}),secret);
    if(operation==='get_mcp_prompt'){
      if(Object.values(input.arguments as object).some(value=>typeof value!=='string'))throw new Error('TOOL_INPUT_INVALID');
      return redactMcpResult(await client.getPrompt({name:String(input.name),arguments:input.arguments as Record<string,string>},{timeout:15000}),secret);
    }
    let cursor:string|undefined;const items:any[]=[];const cursors=new Set<string>();
    for(let count=0;count<10;count++){
      const response=operation==='list_mcp_resources'?await client.listResources(cursor?{cursor}:undefined,{timeout:15000}):await client.listPrompts(cursor?{cursor}:undefined,{timeout:15000});
      items.push(...('resources' in response?response.resources:response.prompts) as any[]);
      if(items.length>500)throw new Error('MCP_CATALOG_TOO_LARGE');cursor=response.nextCursor;
      if(!cursor)return redactMcpResult(page(items,input,5),secret);
      if(cursors.has(cursor))throw new Error('MCP_CATALOG_INVALID');cursors.add(cursor);
    }
    throw new Error('MCP_CATALOG_TOO_LARGE');
  });
  if(result&&typeof result==='object'&&'authorizationUrl' in result)throw new Error('MCP_AUTH_REQUIRED');return result;
}
