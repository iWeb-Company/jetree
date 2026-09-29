import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProviderApiKey } from '../src/lib/server/provider-health';

test('provider validation uses authenticated, read-only provider endpoints', async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response('{}', { status: 200 });
  };

  for (const provider of ['openai', 'gemini', 'claude', 'custom'] as const) {
    assert.deepEqual(await validateProviderApiKey(provider, 'key-example-123', fakeFetch), { ok: true });
  }

  assert.equal(calls.length, 4);
  assert.equal(calls.some(call => call.url.includes('key-example-123')), false);
  assert.equal(calls[0].headers.get('authorization'), 'Bearer key-example-123');
  assert.equal(calls[1].headers.get('x-goog-api-key'), 'key-example-123');
  assert.equal(calls[2].headers.get('x-api-key'), 'key-example-123');
  assert.equal(calls[3].headers.get('authorization'), 'Bearer key-example-123');
});

test('provider validation returns safe health codes without exposing response content', async () => {
  const fakeFetch: typeof fetch = async () => new Response('sensitive provider response', { status: 401 });
  const result = await validateProviderApiKey('openai', 'key-example-123', fakeFetch);
  assert.deepEqual(result, { ok: false, code: 'invalid_credentials' });
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
});
