import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationParameters, checkPkce, MCP_CLIENT, MCP_READ, MCP_WRITE, mcpToken, pkceChallenge, validMcpOrigin } from '../../src/lib/mcp-contract';

const origin = 'https://jetree-dev.iwebtecnology.com';
const verifier = 'v'.repeat(64);
const params = () => new URLSearchParams({ client_id: MCP_CLIENT, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', response_type: 'code', state: 'client-state', resource: origin + '/mcp', code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', scope: MCP_READ + ' ' + MCP_WRITE });
test('Claude OAuth requires PKCE, an exact Claude callback, state and the correct environment resource', () => {
  assert.equal(authorizationParameters(params(), origin).clientId, MCP_CLIENT);
  for (const [key, value] of [['redirect_uri', 'https://claude.ai.evil.test/api/mcp/auth_callback'], ['redirect_uri', 'https://claude.ai/api/mcp/auth_callback?evil=1'], ['resource', 'https://jetree.iwebtecnology.com/mcp'], ['code_challenge_method', 'plain'], ['scope', 'admin'], ['state', ''], ['client_id', 'unknown']]) {
    const invalid = params(); invalid.set(key, value); assert.throws(() => authorizationParameters(invalid, origin), /OAUTH_INVALID_REQUEST/, key);
  }
  assert.equal(checkPkce(verifier, pkceChallenge(verifier)), true);
  assert.equal(checkPkce('x'.repeat(64), pkceChallenge(verifier)), false);
  assert.equal(checkPkce('short', pkceChallenge(verifier)), false);
});
test('opaque MCP credentials are distinct from Supabase JWTs and refresh tokens', () => {
  assert.equal(mcpToken('jtm_a_' + 'a'.repeat(43), 'a'), true);
  assert.equal(mcpToken('jtm_r_' + 'a'.repeat(43), 'a'), false);
  assert.equal(mcpToken('eyJhbGciOi...', 'a'), false);
  assert.equal(validMcpOrigin('https://evil.test', origin), false);
  assert.equal(validMcpOrigin('https://claude.ai', origin), true);
  assert.equal(validMcpOrigin(null, origin), true);
});
