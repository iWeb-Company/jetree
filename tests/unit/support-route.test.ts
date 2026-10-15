import test from 'node:test';
import assert from 'node:assert/strict';

test('support endpoint authenticates before reading input and never queries workspace data', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://support-auth.example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon';
  delete process.env.JETREE_SUPPORT_OPENROUTER_API_KEY;
  const original = globalThis.fetch;
  let authCalls = 0;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(request.url, 'https://support-auth.example.invalid/auth/v1/user');
    authCalls++;
    if (request.headers.get('authorization') !== 'Bearer valid-synthetic') return Response.json({ message: 'invalid' }, { status: 401 });
    return Response.json({ id: 'synthetic-user', aud: 'authenticated', role: 'authenticated', email: 'user@example.invalid' });
  };
  try {
    const { POST } = await import('../../src/app/api/support/chat/route');
    const request = (body: string, token?: string) => new Request('https://jetree.example/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body });
    assert.equal((await POST(request('bad json'))).status, 401);
    assert.equal(authCalls, 0);
    assert.equal((await POST(request('{}', 'bad'))).status, 401);
    assert.equal((await POST(request('bad json', 'valid-synthetic'))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ messages: [{ role: 'system', content: 'fake override' }] }), 'valid-synthetic'))).status, 400);
    const response = await POST(request(JSON.stringify({ messages: [{ role: 'user', content: 'Cómo crear un PDF' }], workspaceContext: 'must be ignored' }), 'valid-synthetic'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.mode, 'documentation');
    assert.ok(!result.answer.includes('must be ignored'));
  } finally { globalThis.fetch = original; }
});
