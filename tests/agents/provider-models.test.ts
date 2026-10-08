import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProviderModels } from '../../src/lib/server/provider-models';

test('model catalog comes from the user credential and filters non-generative Gemini models', async () => {
  const models = await listProviderModels('gemini', 'secret', async (url, options) => {
    assert.match(String(url), /^https:\/\/generativelanguage.googleapis.com\//);
    assert.equal((options?.headers as Record<string, string>)['x-goog-api-key'], 'secret');
    assert.equal(options?.redirect, 'error');
    return Response.json({ models: [{ name: 'models/gemini-test', displayName: 'Test', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }] });
  });
  assert.deepEqual(models, [{ value: 'gemini-test', label: 'Test' }]);
});

test('catalog errors expose no provider response body or credentials', async () => {
  await assert.rejects(listProviderModels('openai', 'secret', async () => new Response('secret diagnostic', { status: 401 })), /^Error: PROVIDER_MODELS_UNAVAILABLE$/);
});
