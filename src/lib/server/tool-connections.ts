import { createHash, randomBytes } from 'node:crypto';
import { googleToolScopeGranted } from '@/lib/google-tool-scopes';
import { getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/server/provider-secrets';
import type { ToolProvider } from '@/lib/agents/tool-catalog';
import { assertToolConnectionConnected } from '@/lib/agents/tool-catalog';
import { githubAccessForCredentials, type GithubAccess } from '@/lib/agents/github-access';

export type OAuthCredentials = { access_token: string; refresh_token?: string; expires_at?: number; token_type?: string; scope?: string; github_access?: GithubAccess };

export function appBaseUrl(): string {
  const value = process.env.JETREE_APP_URL;
  if (!value) throw new Error('TOOL_OAUTH_NOT_CONFIGURED');
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('TOOL_OAUTH_NOT_CONFIGURED');
  }
  return url.origin;
}

export function toolOAuthCallbackUrl(): string {
  return new URL('/api/tool-connections/oauth/callback', appBaseUrl()).toString();
}

export type { GithubAccess } from '@/lib/agents/github-access';

export async function getGithubConnectionAccess(userId: string): Promise<GithubAccess> {
  const { data, error } = await getServiceSupabase().from('tool_connections')
    .select('ciphertext, iv, auth_tag, status').eq('user_id', userId).eq('provider', 'github').maybeSingle();
  if (error || !data) throw new Error('TOOL_CONNECTION_REQUIRED');
  assertToolConnectionConnected(data.status);
  const credentials = JSON.parse(decryptProviderSecret(data)) as OAuthCredentials;
  return githubAccessForCredentials(credentials.scope, credentials.github_access);
}

export async function createOAuthState(userId: string, provider: ToolProvider, githubAccess: GithubAccess = 'public'): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  const service = getServiceSupabase();
  await service.from('tool_oauth_states').delete().lt('expires_at', new Date().toISOString());
  const { error } = await service.from('tool_oauth_states').insert({
    state_hash: stateHash, user_id: userId, provider, github_access: provider === 'github' ? githubAccess : 'public',
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error('TOOL_OAUTH_STATE_FAILED');
  return state;
}

export async function consumeOAuthState(state: string): Promise<{ userId: string; provider: ToolProvider; githubAccess: GithubAccess } | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(state)) return null;
  const stateHash = createHash('sha256').update(state).digest('hex');
  const service = getServiceSupabase();
  const { data, error } = await service.from('tool_oauth_states').delete()
    .eq('state_hash', stateHash).gt('expires_at', new Date().toISOString())
    .select('user_id, provider, github_access').maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, provider: data.provider as ToolProvider, githubAccess: data.github_access === 'private' ? 'private' : 'public' };
}

export async function storeToolConnection(userId: string, provider: ToolProvider, credentials: OAuthCredentials, accountLabel: string | null) {
  if (!credentials.access_token || credentials.access_token.length > 8192) throw new Error('TOOL_OAUTH_TOKEN_INVALID');
  if (!credentials.refresh_token) {
    const service = getServiceSupabase();
    const { data: existing } = await service.from('tool_connections').select('ciphertext, iv, auth_tag, account_label')
      .eq('user_id', userId).eq('provider', provider).maybeSingle();
    if (existing && accountLabel && existing.account_label === accountLabel) {
      try {
        const prior = JSON.parse(decryptProviderSecret(existing)) as OAuthCredentials;
        credentials = { ...credentials, refresh_token: prior.refresh_token };
      } catch { /* A new token replaces an unreadable prior credential. */ }
    }
  }
  const encrypted = encryptProviderSecret(JSON.stringify(credentials));
  const service = getServiceSupabase();
  const { data, error } = await service.from('tool_connections').upsert({
    user_id: userId, provider, status: 'connected', ...encrypted,
    scopes: (credentials.scope || '').split(/[ ,]+/).filter(Boolean),
    expires_at: credentials.expires_at ? new Date(credentials.expires_at).toISOString() : null,
    account_label: accountLabel?.slice(0, 200) || null,
    connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' }).select('provider, status, scopes, expires_at, account_label, connected_at').single();
  if (error || !data) throw new Error('TOOL_CONNECTION_SAVE_FAILED');
  return data;
}

export async function getToolAccessToken(userId: string, provider: ToolProvider): Promise<string> {
  const service = getServiceSupabase();
  const { data, error } = await service.from('tool_connections')
    .select('ciphertext, iv, auth_tag, status, expires_at, account_label').eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (error) throw new Error('TOOL_CONNECTION_LOOKUP_FAILED');
  if (!data) throw new Error('TOOL_CONNECTION_REQUIRED');
  assertToolConnectionConnected(data.status);
  const credentials = JSON.parse(decryptProviderSecret(data)) as OAuthCredentials;
  if ((provider === 'google_drive' || provider === 'gmail') && data.expires_at && Date.parse(data.expires_at) < Date.now() + 60_000) {
    if (!credentials.refresh_token || !process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
      await service.from('tool_connections').update({ status: 'expired' }).eq('user_id', userId).eq('provider', provider);
      await service.from('tool_connection_audit').insert({ user_id: userId, provider, action: 'refresh_failed' });
      throw new Error('TOOL_CONNECTION_EXPIRED');
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: credentials.refresh_token, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await service.from('tool_connections').update({ status: 'expired' }).eq('user_id', userId).eq('provider', provider);
      await service.from('tool_connection_audit').insert({ user_id: userId, provider, action: 'refresh_failed' });
      throw new Error('TOOL_CONNECTION_EXPIRED');
    }
    const refreshed = await response.json() as { access_token?: string; expires_in?: number; scope?: string };
    if (!refreshed.access_token || !refreshed.expires_in) throw new Error('TOOL_PROVIDER_FAILED');
    if (!googleToolScopeGranted(provider, refreshed.scope || credentials.scope)) throw new Error('TOOL_PROVIDER_AUTH_FAILED');
    const updated = { ...credentials, access_token: refreshed.access_token, expires_at: Date.now() + refreshed.expires_in * 1000, scope: refreshed.scope || credentials.scope };
    await storeToolConnection(userId, provider, updated, data.account_label || null);
    return updated.access_token;
  }
  return credentials.access_token;
}
