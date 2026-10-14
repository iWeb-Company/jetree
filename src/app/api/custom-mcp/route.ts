import {NextResponse} from 'next/server';
import {requireUser,getServiceSupabase} from '@/lib/server/auth';
import {readBoundedJson} from '@/lib/server/bounded-json';
import {mcpUuid} from '@/lib/custom-mcp-contract';
import {mcpDefinitionHash,safeMcpError} from '@/lib/server/custom-mcp-client';
import {createCustomMcpConnection,refreshCustomMcpConnection,assignCustomMcpConnection,setCustomMcpReadOnly,revokeCustomMcpConnection} from '@/lib/server/custom-mcp-management';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown) {
  const code=error instanceof Error&&error.message==='AUTH_REQUIRED'?'AUTH_REQUIRED':safeMcpError(error).message;
  const messages:Record<string,string>={AUTH_REQUIRED:'Iniciá sesión.',TOOL_NOT_AUTHORIZED:'No tenés acceso a esa conexión o agente.',TOOL_INPUT_INVALID:'Revisá los datos del conector.',MCP_URL_INVALID:'Usá una URL HTTPS pública, sin usuario ni contraseña.',MCP_URL_CREDENTIAL:'Ingresá la credencial en el campo de token; no en la URL.',MCP_ADDRESS_DENIED:'El servidor debe ser público y accesible desde Jetree.',MCP_AUTH_REQUIRED:'El servidor necesita autorización. Pulsá Conectar para continuar.',MCP_BUSY:'La conexión está ocupada. Esperá a que termine la operación actual.',MCP_CONNECTION_LIMIT:'Alcanzaste el límite de 20 MCP conectados.',MCP_HEADER_INVALID:'Ese encabezado no puede usarse para el token.',MCP_CATALOG_TOO_LARGE:'El catálogo supera el tamaño admitido por Jetree.',MCP_REDIRECT_DENIED:'La URL redirige a otro endpoint. Usá la URL MCP final.',MCP_SCHEMA_INVALID:'El esquema no pudo validarse dentro de los límites.',MCP_RATE_LIMITED:'El servidor alcanzó su límite de uso.',MCP_CONNECTION_FAILED:'No se pudo conectar al servidor MCP. Revisá URL, transporte y autenticación.'};
  return NextResponse.json({code,error:messages[code]||'No se pudo completar la operación MCP.'},{status:code==='AUTH_REQUIRED'?401:code==='TOOL_NOT_AUTHORIZED'?403:code==='MCP_AUTH_REQUIRED'||code==='MCP_BUSY'?409:code==='TOOL_INPUT_INVALID'||code.startsWith('MCP_URL')||code==='MCP_HEADER_INVALID'?400:502,headers});
}
export async function GET(request:Request) {
  try{
    const {client,user}=await requireUser(request);const db=getServiceSupabase();
    const [connections,access,agents,departments]=await Promise.all([
      db.from('custom_mcp_connections').select('id,name,url,transport,auth_mode,status,tools,read_only_tools,capabilities,updated_at').eq('user_id',user.id).neq('status','revoked').order('created_at').limit(20),
      db.from('custom_mcp_agent_access').select('connection_id,agent_id').eq('user_id',user.id).limit(2000),
      client.from('agents').select('id,name,role_type,department_id,enabled_tool_ids').is('deleted_at',null).limit(1000),
      client.from('departments').select('id').is('deleted_at',null),
    ]);
    if([connections,access,agents,departments].some(r=>r.error))throw new Error('MCP_STORAGE_FAILED');
    const liveDepartments=new Set((departments.data||[]).map(d=>d.id));
    return NextResponse.json({connections:(connections.data||[]).map(c=>({...c,tools:c.tools.map((t:any)=>({...t,readOnly:c.read_only_tools[t.name]===mcpDefinitionHash(t)})),read_only_tools:undefined,agentIds:(access.data||[]).filter(a=>a.connection_id===c.id).map(a=>a.agent_id)})),agents:(agents.data||[]).filter(a=>liveDepartments.has(a.department_id))},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try{
    const {client,user}=await requireUser(request);const body=await readBoundedJson(request,40000);
    if(body.action==='create'){
      const id=await createCustomMcpConnection(user.id,body);
      try{return NextResponse.json({id,...await refreshCustomMcpConnection(user.id,id,{interactive:true})},{headers});}
      catch(error){const response=failure(error);return NextResponse.json({id,...await response.json()},{status:response.status,headers});}
    }
    const id=mcpUuid(body.id);
    if(body.action==='connect')return NextResponse.json(await refreshCustomMcpConnection(user.id,id,{interactive:true}),{headers});
    if(body.action==='assign')await assignCustomMcpConnection(client,user.id,body);
    else if(body.action==='readOnly')await setCustomMcpReadOnly(user.id,id,body.names);
    else if(body.action==='revoke')await revokeCustomMcpConnection(user.id,id);
    else throw new Error('TOOL_INPUT_INVALID');
    return NextResponse.json({ok:true},{headers});
  }catch(error){return failure(error);}
}
