import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProviderApiKey } from '../src/lib/server/provider-detection';
import { listProviderModels } from '../src/lib/server/provider-models';
import { freeLLMApiBaseUrl } from '../src/lib/server/freellmapi';
import { analyzeWithFreeLLMApi } from '../src/lib/openai';

test('FreeLLMAPI validates only at the configured gateway, rejects bad keys and keeps the full catalog', async () => {
  const previous = process.env.FREELLMAPI_BASE_URL;
  process.env.FREELLMAPI_BASE_URL = 'http://freellmapi-dev:3001/v1/';
  try {
    let calls = 0;
    const fetcher: typeof fetch = async (url, options) => {
      calls++;
      assert.equal(String(url), 'http://freellmapi-dev:3001/v1/models');
      assert.equal(options?.redirect, 'error');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer freellmapi-synthetic');
      return Response.json({ data: Array.from({ length: 1201 }, (_, i) => ({ id: `model-${i}` })) });
    };
    assert.deepEqual(await detectProviderApiKey('freellmapi-synthetic', fetcher), { ok: true, provider: 'freellmapi' });
    assert.equal(calls, 1);
    assert.equal((await listProviderModels('freellmapi', 'freellmapi-synthetic', fetcher)).length, 1201);
    assert.deepEqual(await detectProviderApiKey('freellmapi-invalid', async () => new Response('', { status: 401 })), { ok: false, code: 'invalid_credentials' });
    delete process.env.FREELLMAPI_BASE_URL;
    assert.deepEqual(await detectProviderApiKey('freellmapi-synthetic', async () => { throw new Error('must not transmit'); }), { ok: false, code: 'provider_unavailable' });
    for (const url of ['https://secret@gateway/v1', 'https://gateway/v1?key=secret', 'file:///tmp/key']) {
      process.env.FREELLMAPI_BASE_URL = url;
      assert.throws(freeLLMApiBaseUrl);
    }
  } finally {
    if (previous === undefined) delete process.env.FREELLMAPI_BASE_URL;
    else process.env.FREELLMAPI_BASE_URL = previous;
  }
});

test('FreeLLMAPI chat passes the selected model and secret only to its gateway', async () => {
  const previous = process.env.FREELLMAPI_BASE_URL; const originalFetch = globalThis.fetch;
  process.env.FREELLMAPI_BASE_URL = 'http://freellmapi-dev:3001/v1';
  try {
    globalThis.fetch = async (input, options) => {
      assert.equal(String(input), 'http://freellmapi-dev:3001/v1/chat/completions');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer freellmapi-synthetic');
      const body = JSON.parse(String(options?.body));
      assert.equal(options?.redirect, 'error');
      assert.equal(body.model, 'provider/custom-model:free');
      return Response.json({ choices: [{ message: { content: 'Gateway OK' } }] });
    };
    assert.equal(await analyzeWithFreeLLMApi('test', 'freellmapi-synthetic', 'provider/custom-model:free'), 'Gateway OK');
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.FREELLMAPI_BASE_URL;
    else process.env.FREELLMAPI_BASE_URL = previous;
  }
});
