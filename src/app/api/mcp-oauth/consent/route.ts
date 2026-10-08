import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { authorizationParameters, MCP_WRITE, tokenHash, UUID } from '@/lib/mcp-contract';
import { appBaseUrl } from '@/lib/server/tool-connections';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { mcpJsonHeaders } from '@/lib/server/mcp-auth';
export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await readBoundedJson(request, 12_000);
    if (typeof body.query !== 'string' || body.query.length > 6000) throw new Error('OAUTH_INVALID_REQUEST');
    const params = authorizationParameters(new URLSearchParams(body.query), appBaseUrl());
    const destination = new URL(params.redirectUri); destination.searchParams.set('state', params.state);
    if (body.decision === 'deny') { destination.searchParams.set('error', 'access_denied'); return NextResponse.json({ redirect: destination.toString() }, { headers: mcpJsonHeaders }); }
    if (body.decision !== 'approve' || !Array.isArray(body.agentIds) || !body.agentIds.length || body.agentIds.length > 100 || body.agentIds.some((id: unknown) => typeof id !== 'string' || !UUID.test(id))) throw new Error('OAUTH_INVALID_REQUEST');
    const ids = [...new Set(body.agentIds as string[])];
    const { data: allowed, error: accessError } = await client.from('agents').select('id').in('id', ids).is('deleted_at', null);
    if (accessError || allowed?.length !== ids.length) throw new Error('OAUTH_INVALID_REQUEST');
    const code = randomBytes(32).toString('base64url');
    const scopes = params.scopes.filter(scope => scope !== MCP_WRITE || body.allowWrites === true);
    const service = getServiceSupabase();
    const { error } = await service.rpc('mcp_issue_code', { owner_id: user.id, code_hash: tokenHash(code), code_challenge: params.challenge, redirect_uri: params.redirectUri, resource_uri: params.resource, granted_scopes: scopes, permitted_agents: ids });
    if (error) throw new Error('MCP_UNAVAILABLE');
    destination.searchParams.set('code', code);
    return NextResponse.json({ redirect: destination.toString() }, { headers: mcpJsonHeaders });
  } catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 'Iniciá sesión en Jetree.' : 'No se pudo autorizar el conector.' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 400, headers: mcpJsonHeaders }); }
}
