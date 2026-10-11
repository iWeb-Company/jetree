import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { getToolAccessToken } from '@/lib/server/tool-connections';
import type { ToolProvider } from '@/lib/agents/tool-catalog';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const service = getServiceSupabase();
    const { data, error } = await service.from('tool_connections')
      .select('provider, status, scopes, expires_at, account_label, connected_at, updated_at').eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'No se pudieron cargar los conectores.' }, { status: 500 });
    return NextResponse.json({ connections: data || [] });
  } catch {
    return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser(request);
    const provider = new URL(request.url).searchParams.get('provider');
    if (provider !== 'github' && provider !== 'google_drive' && provider !== 'gmail') return NextResponse.json({ error: 'Conector inválido.' }, { status: 400 });
    let remoteRevoked = false;
    try {
      const token = await getToolAccessToken(user.id, provider as ToolProvider);
      if (provider === 'google_drive' || provider === 'gmail') {
        const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(8_000) });
        remoteRevoked = response.ok;
      } else {
        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
        if (clientId && clientSecret) {
          const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
          const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`, {
            method: 'DELETE', headers: { Authorization: `Basic ${basic}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: token }), signal: AbortSignal.timeout(8_000),
          });
          remoteRevoked = response.ok;
        }
      }
    } catch { /* Always remove the local credential, even when remote revocation is unavailable. */ }

    const service = getServiceSupabase();
    const { error } = await service.from('tool_connections').delete().eq('user_id', user.id).eq('provider', provider);
    if (error) return NextResponse.json({ error: 'No se pudo eliminar la conexión local.' }, { status: 500 });
    // Google revocation can revoke the other grant for the same OAuth client.
    if (remoteRevoked && provider !== 'github') {
      await service.from('tool_connections').update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('provider', provider === 'gmail' ? 'google_drive' : 'gmail');
    }
    await service.from('tool_connection_audit').insert({ user_id: user.id, provider, action: 'revoked' });
    return NextResponse.json({ ok: true, remoteRevoked });
  } catch {
    return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
  }
}
