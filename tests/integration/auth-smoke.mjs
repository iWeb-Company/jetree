import assert from 'node:assert/strict';

// Run against a local server using synthetic environment values only.
const origin = new URL(process.env.JETREE_SMOKE_URL || 'http://127.0.0.1:3057');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use a local disposable server');
const cases = [
  ['GET', '/api/agents', 401],
  ['POST', '/api/agents', 401],
  ['GET', '/api/departments', 401],
  ['POST', '/api/departments', 401],
  ['GET', '/api/tasks', 401],
  ['POST', '/api/tasks', 401],
  ['GET', '/api/conversations', 401],
  ['GET', '/api/provider-connections', 401],
  ['POST', '/api/provider-connections', 401],
  ['GET', '/api/tool-connections', 401],
  ['GET', '/api/agent-tools', 401],
  ['POST', '/api/agent-tools', 401],
  ['POST', '/api/agent-tools/approvals', 401],
  ['POST', '/api/agents/chat', 401],
  ['GET', '/api/model-devices', 410],
  ['GET', '/api/mcp-connections', 410],
  ['DELETE', '/api/mcp-connections?id=40000000-0000-0000-0000-000000000001', 410],
  ['POST', '/api/mcp-oauth/consent', 410],
  ['POST', '/api/mcp-oauth/register', 410],
  ['POST', '/api/mcp-oauth/token', 410],
  ['POST', '/api/model-devices', 410],
  ['DELETE', '/api/model-devices?id=30000000-0000-0000-0000-000000000001', 410],
  ['POST', '/api/model-devices/relay', 410],
  ['POST', '/api/model-devices/connect', 410],
  ['POST', '/api/telegram/worker', 401],
  ['POST', '/api/webhook/telegram', 410],
];
for (let attempt = 0; ; attempt++) {
  try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); break; }
  catch (error) {
    if (attempt >= 19) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
for (const [method, path, status] of cases) {
  const response = await fetch(new URL(path, origin), {
    method, headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(5000), redirect: 'manual',
  });
  assert.equal(response.status, status, `${method} ${path}`);
  console.log(`PASS ${method} ${path}: ${status}`);
}
console.log(`Verified ${cases.length} HTTP authentication boundaries; no authenticated E2E coverage implied.`);
