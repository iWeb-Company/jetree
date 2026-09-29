import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { appBaseUrl, consumeOAuthState, createOAuthState, storeToolConnection, toolOAuthCallbackUrl, type OAuthCredentials } from '@/lib/server/tool-connections';
import type { ToolProvider } from '@/lib/agents/tool-catalog';

export const runtime = 'nodejs';

function failRedirect(code: string) {
  try { return NextResponse.redirect(new URL('/?tool_connection=error&code=' + encodeURIComponent(code), appBaseUrl())); }
  catch { return NextResponse.json({ error: 'El OAuth no está configurado correctamente.', code }, { status: 503 }); }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.pathname.endsWith('/callback');
  if (!callback) {
    try {
      const { user } = await requireUser(request);
      const provider = url.searchParams.get('provider');
      if (provider !== 'github' && provider !== 'google_drive') return NextResponse.json({ error: 'Conector inválido.' }, { status: 400 });
      const clientId = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_ID : process.env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId) return NextResponse.json({ error: 'El OAuth del conector no está configurado en el servidor.' }, { status: 503 });
      const state = await createOAuthState(user.id, provider as ToolProvider);
      const redirectUri = toolOAuthCallbackUrl();
      const authUrl = provider === 'github'
        ? new URL('https://github.com/login/oauth/authorize')
        : new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      if (provider === 'github') {
        authUrl.searchParams.set('scope', 'read:user public_repo');
        authUrl.searchParams.set('allow_signup', 'false');
      } else {
        authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
      }
      return NextResponse.json({ authorizationUrl: authUrl.toString() });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'No se pudo iniciar OAuth. Verificá la configuración del servidor.', code }, { status: code === 'AUTH_REQUIRED' ? 401 : 503 });
    }
  }

  try {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code');
    const stateInfo = await consumeOAuthState(state);
    if (!stateInfo) return failRedirect('oauth_state_invalid');
    if (url.searchParams.has('error')) return failRedirect('authorization_denied');
    if (!code || code.length > 4096) return failRedirect('oauth_callback_invalid');
    const provider = stateInfo.provider;
    const clientId = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_ID : process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_SECRET : process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return failRedirect('oauth_not_configured');

    let credentials: OAuthCredentials;
    let accountLabel: string | null = null;
    if (provider === 'github') {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: toolOAuthCallbackUrl(), state }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return failRedirect('oauth_exchange_failed');
      const token = await response.json() as { access_token?: string; scope?: string; token_type?: string; error?: string };
      if (!token.access_token) return failRedirect('oauth_exchange_failed');
      credentials = { access_token: token.access_token, scope: token.scope, token_type: token.token_type };
      const account = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(10_000) });
      if (!account.ok) return failRedirect('oauth_identity_failed');
      const profile = await account.json() as { login?: string };
      accountLabel = profile.login || null;
    } else {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: toolOAuthCallbackUrl(), grant_type: 'authorization_code' }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return failRedirect('oauth_exchange_failed');
      const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
      if (!token.access_token) return failRedirect('oauth_exchange_failed');
      credentials = { access_token: token.access_token, refresh_token: token.refresh_token, expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined, scope: token.scope, token_type: token.token_type };
      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
      if (!profileResponse.ok) return failRedirect('oauth_identity_failed');
      const profile = await profileResponse.json() as { email?: string };
      accountLabel = profile.email || null;
    }

    await storeToolConnection(stateInfo.userId, provider, credentials, accountLabel);
    const service = getServiceSupabase();
    const { error: auditError } = await service.from('tool_connection_audit').insert({ user_id: stateInfo.userId, provider, action: 'connected' });
    if (auditError) {
      await service.from('tool_connections').delete().eq('user_id', stateInfo.userId).eq('provider', provider);
      return failRedirect('connection_audit_failed');
    }
    return NextResponse.redirect(new URL('/?tool_connection=connected&provider=' + provider, appBaseUrl()));
  } catch {
    return failRedirect('oauth_callback_failed');
  }
}
