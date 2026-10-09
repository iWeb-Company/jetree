// Test-only preload; refuses hosted databases and non-CI use. Never imported by app.
import assert from 'node:assert/strict';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
assert.equal(process.env.CI, 'true');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const realFetch = globalThis.fetch;
const issuers = new Map([
  ['api.openai.com', ['sk-proj-synthetic-', 'openai']],
  ['api.deepseek.com', ['sk-synthetic-deepseek-', 'deepseek']],
  ['api.anthropic.com', ['sk-ant-api03-synthetic-', 'claude']],
  ['generativelanguage.googleapis.com', ['AIzaSynthetic-', 'gemini']],
  ['openrouter.ai', ['sk-or-v1-synthetic-', 'custom']],
]);
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const issuer = issuers.get(url.hostname);
  if (!issuer) return realFetch(input, options);
  const headers = new Headers(options?.headers);
  const key = headers.get('authorization')?.replace(/^Bearer /,'') || headers.get('x-api-key') || headers.get('x-goog-api-key') || '';
  // No real key leaves this disposable test process.
  if (!key.includes('synthetic-')) throw new Error('Fixture refuses non-synthetic provider key');
  if (!key.startsWith(issuer[0]) || key.endsWith('-invalid')) return Response.json({ error: 'Rejected synthetic key' }, { status: 401 });
  if (options?.method === 'POST') {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'synthetic-deepseek');
    return Response.json({ id: 'synthetic', choices: [{ message: { role: 'assistant', content: 'Synthetic DeepSeek API OK' } }] });
  }
  return issuer[1] === 'gemini'
    ? Response.json({ models: [{ name: 'models/synthetic-gemini', supportedGenerationMethods: ['generateContent'] }] })
    : Response.json({ data: [{ id: 'synthetic-' + issuer[1] }] });
};
