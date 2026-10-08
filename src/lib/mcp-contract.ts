import { createHash, timingSafeEqual } from 'node:crypto';

export const MCP_CLIENT = 'jetree-claude';
export const MCP_REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export const MCP_READ = 'jetree:read';
export const MCP_WRITE = 'jetree:request-write';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function pkceChallenge(value: string) { return createHash('sha256').update(value).digest('base64url'); }
export function checkPkce(verifier: unknown, expected: string) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = Buffer.from(pkceChallenge(verifier)); const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
export function authorizationParameters(params: URLSearchParams, origin: string) {
  const clientId = params.get('client_id'); const redirectUri = params.get('redirect_uri') || '';
  const challenge = params.get('code_challenge') || ''; const state = params.get('state') || '';
  const resource = params.get('resource');
  const scopes = [...new Set((params.get('scope') || MCP_READ).split(' ').filter(Boolean))];
  if (clientId !== MCP_CLIENT || !MCP_REDIRECTS.includes(redirectUri) || params.get('response_type') !== 'code'
    || params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    || !state || state.length > 1024 || resource !== origin + '/mcp'
    || !scopes.includes(MCP_READ) || scopes.some(scope => ![MCP_READ, MCP_WRITE].includes(scope))) throw new Error('OAUTH_INVALID_REQUEST');
  return { clientId, redirectUri, challenge, state, scopes, resource };
}
export function validMcpOrigin(origin: string | null, appOrigin: string) {
  return !origin || [appOrigin, 'https://claude.ai', 'https://claude.com'].includes(origin);
}
export function mcpToken(value: unknown, type: 'a' | 'r') {
  return typeof value === 'string' && new RegExp(`^jtm_${type}_[A-Za-z0-9_-]{43}$`).test(value);
}
