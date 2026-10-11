import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProviderApiKey } from '../src/lib/server/provider-detection';
import { listProviderModels } from '../src/lib/server/provider-models';
import { analyzeWithGroq } from '../src/lib/openai';

test('Groq keys go exclusively to its official authenticated endpoint', async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.groq.com/openai/v1/models');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer gsk_synthetic');
    assert.equal(options?.redirect, 'error');
    return Response.json({ data: [{ id: 'openai/gpt-oss-20b' }] });
  };
  assert.deepEqual(await detectProviderApiKey('gsk_synthetic', fetcher), { ok: true, provider: 'groq' });
  assert.deepEqual(await listProviderModels('groq', 'gsk_synthetic', fetcher), [{ value: 'openai/gpt-oss-20b', label: 'openai/gpt-oss-20b' }]);
  assert.deepEqual(await detectProviderApiKey('gsk_invalid', async () => new Response('', { status: 401 })), { ok: false, code: 'invalid_credentials' });
  assert.deepEqual(await detectProviderApiKey('freellmapi-disabled', async () => { throw new Error('must not transmit'); }), { ok: false, code: 'unsupported_key' });
});

test('Groq chat keeps the selected model and rejects redirects', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, options) => {
      assert.equal(String(input), 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer gsk_synthetic');
      assert.equal(options?.redirect, 'error');
      assert.equal(JSON.parse(String(options?.body)).model, 'openai/gpt-oss-20b');
      return Response.json({ choices: [{ message: { content: 'Groq OK' } }] });
    };
    assert.equal(await analyzeWithGroq('test', 'gsk_synthetic', 'openai/gpt-oss-20b'), 'Groq OK');
  } finally { globalThis.fetch = originalFetch; }
});
