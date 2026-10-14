import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import {UnauthorizedError,type OAuthClientProvider,type OAuthDiscoveryState} from '@modelcontextprotocol/sdk/client/auth.js';
import type {OAuthClientInformationMixed,OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {getServiceSupabase} from './auth';
import {decryptProviderSecret,encryptProviderSecret} from './provider-secrets';
import {appBaseUrl} from './tool-connections';
import {mcpNetwork,mcpUrl} from './custom-mcp-network';
import {boundedMcpJson,mcpText,type CustomMcpTool} from '@/lib/custom-mcp-contract';

export type McpSecret={token?:string;headerName?:string;client?:OAuthClientInformationMixed;tokens?:OAuthTokens;expiresAt?:number;verifier?:string;discovery?:OAuthDiscoveryState};
export type McpConnection={id:string;user_id:string;name:string;url:string;transport:'auto'|'streamable_http'|'sse';auth_mode:'none'|'token'|'oauth';status:string;tools:CustomMcpTool[];read_only_tools:Record<string,string>;configuration_version:number;ciphertext:string;iv:string;auth_tag:string};
export const mcpDefinitionHash=(tool:CustomMcpTool)=>createHash('sha256').update(JSON.stringify(tool)).digest('hex');
export const mcpStateHash=(state:string)=>createHash('sha256').update(state).digest('hex');
const secretValues=(secret:McpSecret)=>[secret.token,secret.tokens?.access_token,secret.tokens?.refresh_token,secret.client?.client_secret,secret.verifier].filter((item):item is string=>typeof item==='string'&&Boolean(item));
export function assertMcpCatalogSafe(tools:CustomMcpTool[],secret:McpSecret){const text=JSON.stringify(tools);if(secretValues(secret).some(value=>text.includes(value)))throw new Error('MCP_CATALOG_INVALID');}
export function normalizeMcpTools(tools:any[]):CustomMcpTool[] {
  if(tools.length>500)throw new Error('MCP_CATALOG_TOO_LARGE');
  const normalized=tools.map(tool=>{
    const name=mcpText(tool.name,200);if(!tool.inputSchema||tool.inputSchema.type!=='object')throw new Error('MCP_SCHEMA_INVALID');
    boundedMcpJson(tool.inputSchema,16000);
    if(tool.outputSchema)boundedMcpJson(tool.outputSchema,16000);
    return {name,description:String(tool.description||'').slice(0,500),inputSchema:tool.inputSchema,...(tool.outputSchema?{outputSchema:tool.outputSchema}:{}),...(tool.annotations?{annotations:{readOnlyHint:tool.annotations.readOnlyHint===true,destructiveHint:tool.annotations.destructiveHint===true}}:{})};
  });
  if(new Set(normalized.map(tool=>tool.name)).size!==normalized.length||Buffer.byteLength(JSON.stringify(normalized))>900000)throw new Error('MCP_CATALOG_TOO_LARGE');
  return normalized;
}
export async function discoverMcpTools(client:Client):Promise<CustomMcpTool[]> {
  if(!client.getServerCapabilities()?.tools)return [];
  const tools:any[]=[];let cursor:string|undefined;const seen=new Set<string>();
  for(let page=0;page<10;page++){
    const result=await client.listTools(cursor?{cursor}:undefined,{timeout:15000});tools.push(...result.tools);
    if(tools.length>500)throw new Error('MCP_CATALOG_TOO_LARGE');
    cursor=result.nextCursor;if(!cursor)return normalizeMcpTools(tools);
    if(seen.has(cursor))throw new Error('MCP_CATALOG_INVALID');seen.add(cursor);
  }
  throw new Error('MCP_CATALOG_TOO_LARGE');
}
export function redactMcpResult(value:unknown,secret:McpSecret) {
  const privateValues=secretValues(secret);
  const text=(value:string)=>{for(const key of privateValues)value=value.split(key).join('[credencial omitida]');return value.slice(0,16000);};
  const clean=(item:any,depth=0):any=>{
    if(depth>20)return '[contenido profundo omitido]';
    if(typeof item==='string')return text(item);
    if(Array.isArray(item))return item.slice(0,50).map(child=>clean(child,depth+1));
    if(item&&typeof item==='object'){
      if(['image','audio'].includes(item.type)||typeof item.blob==='string')return {type:text(String(item.type||'resource')),mimeType:typeof item.mimeType==='string'?text(item.mimeType):undefined,notice:'Contenido binario omitido del chat de texto.'};
      return Object.fromEntries(Object.entries(item).slice(0,100).map(([key,child])=>[text(key),clean(child,depth+1)]));
    }
    return item;
  };
  const result=clean(value);if(Buffer.byteLength(JSON.stringify(result))>40000)return {content:[{type:'text',text:JSON.stringify(result).slice(0,12000)}],truncated:true};return result;
}
export function safeMcpError(error:unknown):Error {
  const e=error as {message?:string;code?:number;name?:string};
  const codes=['MCP_URL_INVALID','MCP_URL_CREDENTIAL','MCP_ADDRESS_DENIED','MCP_DNS_TIMEOUT','MCP_NETWORK_LIMIT','MCP_TIMEOUT','MCP_RESPONSE_TOO_LARGE','MCP_REDIRECT_DENIED','MCP_CATALOG_TOO_LARGE','MCP_CATALOG_INVALID','MCP_SCHEMA_INVALID','MCP_AUTH_REQUIRED','MCP_BUSY','MCP_STORAGE_FAILED','MCP_TOOL_FAILED','MCP_CATALOG_CHANGED','MCP_RATE_LIMITED','MCP_CONNECTION_LIMIT','MCP_HEADER_INVALID','TOOL_INPUT_INVALID','TOOL_NOT_AUTHORIZED','TOOL_CONNECTION_REQUIRED','TOOL_APPROVAL_NOT_PENDING','SERVER_CONFIGURATION_ERROR'];
  if(e.message&&codes.includes(e.message))return new Error(e.message);
  if(error instanceof UnauthorizedError||e.code===401||e.code===403)return new Error('MCP_AUTH_REQUIRED');
  if(e.code===429)return new Error('MCP_RATE_LIMITED');
  return new Error('MCP_CONNECTION_FAILED');
}
export async function ownedMcpConnection(userId:string,id:string):Promise<McpConnection> {
  const {data,error}=await getServiceSupabase().from('custom_mcp_connections').select('*').eq('id',id).eq('user_id',userId).neq('status','revoked').maybeSingle();
  if(error||!data)throw new Error('TOOL_NOT_AUTHORIZED');return data;
}
export async function consumeMcpOAuthState(state:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(state))throw new Error('MCP_AUTH_REQUIRED');
  const {data,error}=await getServiceSupabase().from('custom_mcp_oauth_states').delete().eq('state_hash',mcpStateHash(state)).gt('expires_at',new Date().toISOString()).select('connection_id,user_id,configuration_version').maybeSingle();
  if(error||!data)throw new Error('MCP_AUTH_REQUIRED');return data;
}
export async function withMcpClient<T>(userId:string,id:string,action:(client:Client,connection:McpConnection,secret:McpSecret)=>Promise<T>,options:{interactive?:boolean;authorizationCode?:string;version?:number;networkFactory?:typeof mcpNetwork}={}):Promise<T|{authorizationUrl:string}> {
  const db=getServiceSupabase();const ticket=randomUUID();
  const {data:locked,error:lockError}=await db.rpc('lock_custom_mcp_connection',{p_connection:id,p_user:userId,p_ticket:ticket});
  if(lockError)throw new Error('MCP_STORAGE_FAILED');if(!locked)throw new Error('MCP_BUSY');
  const abort=new AbortController();const deadline=setTimeout(()=>abort.abort(),45000);const net=(options.networkFactory||mcpNetwork)(abort.signal);
  let client:Client|undefined;let transport:Transport|undefined;let redirect:string|undefined;
  try {
    const connection=await ownedMcpConnection(userId,id);if(options.version&&connection.configuration_version!==options.version)throw new Error('MCP_AUTH_REQUIRED');
    const secret: McpSecret=JSON.parse(decryptProviderSecret(connection));const endpoint=mcpUrl(connection.url);
    const save=async()=>{
      boundedMcpJson(secret,64000);
      const {data,error}=await db.from('custom_mcp_connections').update({...encryptProviderSecret(JSON.stringify(secret)),updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).eq('lock_ticket',ticket).neq('status','revoked').select('id').maybeSingle();
      if(error||!data)throw new Error('MCP_STORAGE_FAILED');
    };
    let state:string|undefined;
    const provider:OAuthClientProvider={
      redirectUrl:appBaseUrl()+'/api/custom-mcp/oauth/callback',
      clientMetadata:{client_name:'Jetree',redirect_uris:[appBaseUrl()+'/api/custom-mcp/oauth/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:secret.client?.client_secret?'client_secret_post':'none'},
      async state(){
        if(!options.interactive)throw new Error('MCP_AUTH_REQUIRED');
        if(!state){
          // A previous invalid_grant may already have erased the old tokens.
          // Every fresh consent invalidates permissions bound to the old account.
          connection.configuration_version++;const {error:versionError}=await db.from('custom_mcp_connections').update({configuration_version:connection.configuration_version,read_only_tools:{}}).eq('id',id).eq('user_id',userId).eq('lock_ticket',ticket).neq('status','revoked');if(versionError)throw new Error('MCP_STORAGE_FAILED');
          state=randomBytes(32).toString('base64url');await db.from('custom_mcp_oauth_states').delete().eq('connection_id',id).eq('user_id',userId);
          const {error}=await db.from('custom_mcp_oauth_states').insert({state_hash:mcpStateHash(state),connection_id:id,user_id:userId,configuration_version:connection.configuration_version,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw new Error('MCP_STORAGE_FAILED');}
        return state;
      },
      clientInformation:()=>secret.client,
      async saveClientInformation(value){secret.client=value;await save();},
      tokens:()=>secret.tokens?{...secret.tokens,...(secret.expiresAt?{expires_in:Math.max(0,Math.floor((secret.expiresAt-Date.now())/1000))}:{})}:undefined,
      async saveTokens(value){secret.tokens=value;secret.expiresAt=value.expires_in?Date.now()+value.expires_in*1000:undefined;await save();},
      async redirectToAuthorization(url){if(!options.interactive)throw new Error('MCP_AUTH_REQUIRED');redirect=mcpUrl(url.toString()).href;},
      async saveCodeVerifier(value){secret.verifier=value;await save();},
      codeVerifier(){if(!secret.verifier)throw new Error('MCP_AUTH_REQUIRED');return secret.verifier;},
      discoveryState:()=>secret.discovery,
      async saveDiscoveryState(value){secret.discovery=value;await save();},
      async invalidateCredentials(scope){if(scope==='all'||scope==='tokens'){delete secret.tokens;delete secret.expiresAt;}if(scope==='all'||scope==='client')delete secret.client;if(scope==='all'||scope==='verifier')delete secret.verifier;if(scope==='all'||scope==='discovery')delete secret.discovery;await save();},
    };
    const headers:Record<string,string>={};if(connection.auth_mode==='token'){if(!secret.token)throw new Error('MCP_AUTH_REQUIRED');const name=secret.headerName||'Authorization';headers[name]=name.toLowerCase()==='authorization'?'Bearer '+secret.token:secret.token;}
    const guardedFetch:typeof net.fetch=(input,init)=>{
      const target=new URL(input instanceof Request?input.url:String(input));const authorization=new Headers(init?.headers).get('authorization');
      if(target.origin!==endpoint.origin&&(connection.auth_mode!=='oauth'||authorization==='Bearer '+secret.tokens?.access_token))throw new Error('MCP_ADDRESS_DENIED');
      return net.fetch(input,init);
    };
    const transportOptions={fetch:guardedFetch,requestInit:{headers,redirect:'manual' as const},...(connection.auth_mode==='oauth'?{authProvider:provider}:{})};
    // Schema evaluation runs in a bounded worker below, never in the SDK's
    // synchronous output-schema cache on the application event loop.
    const makeClient=()=>new Client({name:'Jetree',version:'1.0.0'},{capabilities:{},jsonSchemaValidator:{getValidator:()=>((data:any)=>({valid:true as const,data,errorMessage:undefined}))}});
    const connect=async(kind:'streamable_http'|'sse')=>{
      client=makeClient();transport=kind==='sse'?new SSEClientTransport(endpoint,transportOptions):new StreamableHTTPClientTransport(endpoint,{...transportOptions,reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}});
      if(options.authorizationCode)await (transport as StreamableHTTPClientTransport|SSEClientTransport).finishAuth(options.authorizationCode);
      await client.connect(transport,{timeout:15000});
    };
    try{await connect(connection.transport==='sse'?'sse':'streamable_http');}
    catch(error){const code=(error as {code?:number}).code;if(connection.transport!=='auto'||redirect||![400,404,405].includes(Number(code)))throw error;await client?.close().catch(()=>{});await connect('sse');}
    const result=await action(client!,connection,secret);
    await db.from('custom_mcp_connections').update({status:'connected',updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).eq('lock_ticket',ticket).neq('status','revoked');
    if(options.authorizationCode){delete secret.verifier;await save();}
    return result;
  }catch(error){
    const safe=safeMcpError(error);
    await db.from('custom_mcp_connections').update({status:redirect||safe.message==='MCP_AUTH_REQUIRED'?'auth_required':'error',updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).eq('lock_ticket',ticket).neq('status','revoked');
    if(redirect)return {authorizationUrl:redirect};throw safe;
  }finally{clearTimeout(deadline);abort.abort();await client?.close().catch(()=>{});await transport?.close().catch(()=>{});net.close();await db.from('custom_mcp_connections').update({lock_ticket:null,lock_until:null}).eq('id',id).eq('user_id',userId).eq('lock_ticket',ticket);}
}
