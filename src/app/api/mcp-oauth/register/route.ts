import { NextResponse } from 'next/server';
import { MCP_CLIENT, MCP_REDIRECTS } from '@/lib/mcp-contract';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { mcpJsonHeaders } from '@/lib/server/mcp-auth';
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 4000);
    if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.some((uri: unknown) => typeof uri !== 'string' || !MCP_REDIRECTS.includes(uri))
      || (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none')
      || (body.grant_types && (!Array.isArray(body.grant_types) || body.grant_types.some((grant: unknown) => !['authorization_code', 'refresh_token'].includes(String(grant)))))) throw new Error();
    // One preregistered public Claude client; no arbitrary redirects or secrets.
    return NextResponse.json({ client_id: MCP_CLIENT, client_name: 'Claude · Jetree', redirect_uris: MCP_REDIRECTS, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, { status: 201, headers: mcpJsonHeaders });
  } catch { return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400, headers: mcpJsonHeaders }); }
}
