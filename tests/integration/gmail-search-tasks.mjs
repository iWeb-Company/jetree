import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true'); assert.equal(process.env.CI, 'true');
const origin = process.env.JETREE_APP_URL;
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const db = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
const users = []; let browser;
async function api(user, path, method = 'GET', body) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `gmail-${randomBytes(8).toString('hex')}@example.invalid`; const password = randomBytes(24).toString('base64url') + '!Aa1';
    const user = db(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
    users.push({ ...user, email, password, token: db(await client.auth.signInWithPassword({ email, password })).session.access_token });
  }
  const user = users[0];
  const departments = db(await service.from('departments').insert([{ name: 'Sales test', created_by: user.id }, { name: 'Support test', created_by: user.id }]).select('id,name'));
  const agents = db(await service.from('agents').insert([
    { name: 'Manager test', provider: 'gemini', model: 'synthetic-gemini', created_by: user.id, department_id: departments[0].id, role_type: 'manager', enabled_tool_ids: ['plugin-gmail-core', 'plugin-web-search'] },
    { name: 'Agent test', provider: 'gemini', model: 'synthetic-gemini', created_by: user.id, department_id: departments[0].id, role_type: 'independent', enabled_tool_ids: ['plugin-gmail-core', 'plugin-web-search'] },
  ]).select('id,name'));
  const initiate = await api(user, '/api/tool-connections/oauth?provider=gmail'); assert.equal(initiate.status, 200);
  const state = new URL(initiate.body.authorizationUrl).searchParams.get('state');
  const callback = await fetch(origin + '/api/tool-connections/oauth/callback?' + new URLSearchParams({ state, code: 'synthetic-gmail-code' }), { redirect: 'manual' });
  assert.ok(callback.headers.get('location')?.includes('tool_connection=connected'));
  const secret = db(await service.from('tool_connections').select('ciphertext').eq('user_id', user.id).eq('provider', 'gmail').single());
  assert.notEqual(secret.ciphertext, 'synthetic-gmail-token');
  assert.equal((await api(users[1], '/api/tool-connections')).body.connections.length, 0);
  const call = (agent, operation, input, caller = user, toolId = 'plugin-gmail-core') => api(caller, '/api/agent-tools', 'POST', { agentId: agent.id, toolId, operation, input });
  for (const agent of agents) {
    const search = await call(agent, 'search_messages', { query: 'is:unread' }); assert.equal(search.status, 200); assert.equal(search.body.result.messages[0].id, 'synthetic-mail');
    const read = await call(agent, 'get_message', { messageId: 'synthetic-mail' }); assert.equal(read.body.result.text, 'Synthetic email text');
    const web = await call(agent, 'search_youtube', { query: 'test' }, user, 'plugin-web-search'); assert.equal(web.status, 200); assert.match(web.body.result[0].url, /youtube.com\/watch/);
    const write = await call(agent, 'reply_message', { messageId: 'synthetic-mail', to: 'sender@example.invalid', body: 'Approved reply' }); assert.equal(write.body.pendingApproval, true);
    const stolen = await api(users[1], '/api/agent-tools/approvals', 'POST', { approvalId: write.body.approvalId, decision: 'approve' }); assert.notEqual(stolen.status, 200);
    const approved = await api(user, '/api/agent-tools/approvals', 'POST', { approvalId: write.body.approvalId, decision: 'approve' }); assert.equal(approved.status, 200);
    const replay = await api(user, '/api/agent-tools/approvals', 'POST', { approvalId: write.body.approvalId, decision: 'approve' }); assert.notEqual(replay.status, 200);
  }
  assert.equal((await call(agents[0], 'get_message', { messageId: 'synthetic-mail' }, users[1])).status, 403);
  db(await service.from('tool_connections').update({ expires_at: new Date(0).toISOString() }).eq('user_id', user.id).eq('provider', 'gmail'));
  assert.equal((await call(agents[0], 'get_message', { messageId: 'synthetic-mail' })).status, 200);
  db(await service.from('agents').update({ enabled_tool_ids: [] }).eq('id', agents[1].id));
  assert.equal((await call(agents[1], 'get_message', { messageId: 'synthetic-mail' })).status, 403);
  db(await service.from('tasks').insert([
    { title: 'Manager finished', department_id: departments[0].id, assigned_agent_id: agents[0].id, created_by: user.id, status: 'completed' },
    { title: 'Agent finished', department_id: departments[0].id, assigned_agent_id: agents[1].id, created_by: user.id, status: 'completed' },
    { title: 'Support finished', department_id: departments[1].id, created_by: user.id, status: 'completed' },
  ]));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  await page.goto(origin); await page.locator('input[type=email]').fill(user.email); await page.locator('input[type=password]').fill(user.password);
  await page.getByRole('button', { name: 'Acceder al Workspace' }).click(); await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 60000 });
  const sales = page.locator('summary').filter({ hasText: 'Sales test' }); await expect(sales).toBeVisible();
  await expect(page.getByText('Manager finished', { exact: true })).not.toBeVisible();
  await sales.click(); await page.locator('summary').filter({ hasText: 'Manager test' }).click();
  await expect(page.getByText('Manager finished', { exact: true })).toBeVisible();
  await expect(page.getByText('Agent finished', { exact: true })).not.toBeVisible();
  await mkdir('artifacts', { recursive: true });
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: `artifacts/tasks-grouped-${width}.png`, fullPage: true }); }
  console.log('PASS Gmail OAuth, encrypted refresh, manager/agent tools, approvals, isolation and grouped completed tasks');
} finally {
  await browser?.close();
  for (const user of users) { db(await service.from('tasks').delete().eq('created_by', user.id)); db(await service.from('departments').delete().eq('created_by', user.id)); db(await service.from('activity_logs').delete().eq('user_id', user.id)); db(await service.auth.admin.deleteUser(user.id)); }
}
