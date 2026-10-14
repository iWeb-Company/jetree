import {NextResponse} from 'next/server';
import {appBaseUrl} from '@/lib/server/tool-connections';
import {consumeMcpOAuthState} from '@/lib/server/custom-mcp-client';
import {refreshCustomMcpConnection} from '@/lib/server/custom-mcp-management';
export const runtime='nodejs';
export async function GET(request:Request) {
  let success=false;
  try{
    const url=new URL(request.url);const state=url.searchParams.get('state')||'';const code=url.searchParams.get('code')||'';
    const data=await consumeMcpOAuthState(state);
    if(url.searchParams.has('error')||!code||code.length>2048)throw new Error('MCP_AUTH_REQUIRED');
    const result=await refreshCustomMcpConnection(data.user_id,data.connection_id,{authorizationCode:code,version:data.configuration_version});
    if('authorizationUrl' in result)throw new Error('MCP_AUTH_REQUIRED');success=true;
  }catch{/* Never reflect OAuth codes, state, tokens or server error text. */}
  return NextResponse.redirect(new URL('/?customMcp='+ (success?'connected':'auth_error'),appBaseUrl()),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
