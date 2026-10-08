import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { MCP_CLIENT, mcpToken, pkceChallenge, tokenHash } from '@/lib/mcp-contract';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { newMcpToken, mcpJsonHeaders } from '@/lib/server/mcp-auth';
export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new Error();
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 5000) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if (params.get('client_id') !== MCP_CLIENT || params.get('resource') !== appBaseUrl() + '/mcp') throw new Error();
    const kind = params.get('grant_type');
    const access = newMcpToken('a'); const refresh = newMcpToken('r'); const service = getServiceSupabase();
    let data; let error;
    if (kind === 'authorization_code') {
      const code = params.get('code') || ''; const verifier = params.get('code_verifier') || '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error();
      ({ data, error } = await service.rpc('mcp_exchange_code', { code_hash: tokenHash(code), verifier_challenge: pkceChallenge(verifier), redirect_uri: params.get('redirect_uri'), resource_uri: params.get('resource'), new_access_hash: tokenHash(access), new_refresh_hash: tokenHash(refresh) }));
    } else if (kind === 'refresh_token') {
      const previous = params.get('refresh_token'); if (!mcpToken(previous, 'r')) throw new Error();
      ({ data, error } = await service.rpc('mcp_refresh_grant', { old_refresh_hash: tokenHash(previous!), resource_uri: params.get('resource'), new_access_hash: tokenHash(access), new_refresh_hash: tokenHash(refresh) }));
    } else throw new Error();
    if (error || !data) throw new Error();
    return NextResponse.json({ access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: data.scopes.join(' ') }, { headers: mcpJsonHeaders });
  } catch { return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: mcpJsonHeaders }); }
}
