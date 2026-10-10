import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProviderApiKey } from '../src/lib/server/provider-detection';
import { retiredModelPath } from '../src/lib/model-access';

test('recognizable API keys are validated only at the matching issuer, without redirects or inference', async () => {
  for (const [key, provider, host] of [
    ['AIzaSyntheticKey', 'gemini', 'generativelanguage.googleapis.com'],
    ['AQ.Ab-synthetic.auth_key', 'gemini', 'generativelanguage.googleapis.com'],
    ['sk-ant-api03-synthetic', 'claude', 'api.anthropic.com'],
    ['sk-proj-synthetic', 'openai', 'api.openai.com'],
    ['sk-or-v1-synthetic', 'custom', 'openrouter.ai'],
  ]) {
    let calls = 0;
    const fetcher: typeof fetch = async (url, options) => {
      calls++; assert.equal(new URL(String(url)).hostname, host);
      assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
      assert.equal(String(url).includes(key), false);
      return Response.json({ data: [] });
    };
    assert.deepEqual(await detectProviderApiKey(key, fetcher), { ok: true, provider });
    assert.equal(calls, 1);
  }
});

test('overlapping legacy keys are detected by authentication, not by a guessed prefix', async () => {
  for (const provider of ['openai', 'deepseek']) {
    const fetcher: typeof fetch = async url => new Response('{}', { status: String(url).includes(provider === 'openai' ? 'api.openai.com' : 'api.deepseek.com') ? 200 : 401 });
    assert.deepEqual(await detectProviderApiKey('sk-syntheticLegacyKey', fetcher), { ok: true, provider });
  }
});

test('invalid, unknown and ambiguous keys are rejected; transient errors are distinct', async () => {
  assert.deepEqual(await detectProviderApiKey('invalid', async () => { throw new Error('must not send'); }), { ok: false, code: 'unsupported_key' });
  assert.deepEqual(await detectProviderApiKey('sk-ant-oat01-synthetic', async () => { throw new Error('must not send OAuth'); }), { ok: false, code: 'unsupported_key' });
  assert.deepEqual(await detectProviderApiKey('sk-synthetic', async () => new Response('', { status: 401 })), { ok: false, code: 'invalid_credentials' });
  assert.deepEqual(await detectProviderApiKey('sk-synthetic', async () => new Response('{}')), { ok: false, code: 'ambiguous_provider' });
  assert.deepEqual(await detectProviderApiKey('sk-proj-synthetic', async () => new Response('', { status: 429 })), { ok: false, code: 'rate_limited' });
});

test('only model subscription routes are retired; tool OAuth and API connections remain', () => {
  for (const path of ['/mcp', '/claude/autorizar', '/api/model-devices', '/api/model-devices/relay', '/api/mcp-oauth/token', '/.well-known/oauth-authorization-server', '/downloads/jetree-google-connector.tar.gz']) assert.equal(retiredModelPath(path), true);
  for (const path of ['/api/provider-connections', '/api/agents/chat', '/api/tool-connections/oauth/callback', '/api/health']) assert.equal(retiredModelPath(path), false);
});
