import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const origin = process.env.JETREE_APP_URL;
if (process.env.JETREE_DISPOSABLE_CI === 'true') {
  assert.equal(process.env.CI, 'true');
  assert.equal(url, 'http://127.0.0.1:54321');
} else assert.equal(new URL(url).hostname, 'lgimqhuohkjtwfxbaecb.supabase.co');
assert.equal(new URL(origin).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [];
const departments = [];
const agents = [];
const run = randomUUID();
let browser;
let checks = 0;
function pass(label) { checks++; console.log(`PASS ${label}`); }
function db(result, label) { assert.equal(result.error, null, label); return result.data; }
async function api(user, path, method = 'GET', body) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
try {
  // Refuse broad reads in a project containing business data.
  for (const table of ['departments', 'agents', 'tasks']) {
    const result = await service.from(table).select('id', { head: true, count: 'exact' });
    db(result, `preflight ${table}`); assert.equal(result.count, 0, 'E2E requires empty business tables');
  }
  for (let i = 0; i < 5; i++) {
    const email = `jetree-e2e-${run}-${i}@example.invalid`;
    const password = randomBytes(32).toString('base64url') + '!Aa1';
    const created = db(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'create synthetic Auth user');
    const user = { id: created.user.id, email, password, client: createClient(url, key, options) };
    users.push(user);
    const login = db(await user.client.auth.signInWithPassword({ email, password }), 'password login');
    user.token = login.session.access_token;
    if (i >= 2) db(await service.from('profiles').update({ role: 'admin' }).eq('id', user.id), 'synthetic admin role');
  }
  pass('five real Auth password logins');
  for (let i = 0; i < 2; i++) {
    const dep = db(await service.from('departments').insert({ name: `E2E-${i}-${run}`, created_by: users[i].id }).select('id').single(), 'seed department');
    departments.push(dep.id);
    const response = await api(users[i], '/api/agents', 'POST', { department_id: dep.id, name: `E2E-agent-${i}`, provider: 'openai', model: 'synthetic', created_by: users[1 - i].id });
    assert.equal(response.status, 201, 'create own agent');
    assert.equal(response.body.agent.created_by, users[i].id, 'server derives owner');
    agents.push(response.body.agent.id);
    const task = await api(users[i], '/api/tasks', 'POST', { title: 'E2E task', description: 'Synthetic fixture', departmentId: dep.id, assignedAgentId: agents[i] });
    assert.equal(task.status, 201, 'create own task'); users[i].task = task.body.task.id;
    const conversation = db(await users[i].client.from('conversations').insert({ department_id: dep.id, agent_id: agents[i], created_by: users[i].id, title: 'E2E conversation' }).select('id').single(), 'create conversation');
    db(await users[i].client.from('messages').insert({ conversation_id: conversation.id, author_user_id: users[i].id, role: 'user', content: 'Synthetic persisted message' }), 'persist message');
  }
  pass('authenticated CRUD and server-derived ownership');
  for (let i = 0; i < 2; i++) {
    const user = users[i], other = 1 - i;
    const list = await api(user, '/api/agents'); assert.equal(list.status, 200); assert.deepEqual(list.body.agents.map(x => x.id), [agents[i]]);
    assert.equal((await api(user, '/api/agents', 'PATCH', { id: agents[other], name: 'intrusion' })).status, 404);
    assert.equal((await api(user, `/api/agents?id=${agents[other]}`, 'DELETE')).status, 404);
    assert.equal((await api(user, '/api/agents', 'POST', { department_id: departments[other], name: 'intrusion', provider: 'openai', model: 'synthetic' })).status, 400);
    assert.equal((await api(user, '/api/tasks', 'PATCH', { id: users[other].task, status: 'completed' })).status, 404);
    assert.equal((await api(user, '/api/agents/chat', 'POST', { agentId: agents[other], message: 'Do not execute' })).status, 404);
    const history = await api(user, `/api/conversations?agentId=${agents[other]}`); assert.equal(history.status, 200); assert.equal(history.body.conversation, null);
    const rest = db(await user.client.from('agents').select('id').eq('id', agents[other]), 'cross REST read'); assert.equal(rest.length, 0);
    const changed = db(await user.client.from('agents').update({ name: 'intrusion' }).eq('id', agents[other]).select('id'), 'cross REST write'); assert.equal(changed.length, 0);
    const privateRows = await user.client.from('provider_connection_secrets').select('*'); assert.ok(privateRows.error, 'credential table must reject browser role');
  }
  pass('bidirectional HTTP and REST isolation, execution denial, credential denial');
  for (const admin of users.slice(2)) {
    const list = await api(admin, '/api/agents'); assert.equal(list.status, 200); assert.equal(list.body.agents.length, 2);
    assert.equal((await api(admin, '/api/agents', 'PATCH', { id: agents[0], description: 'Synthetic admin update' })).status, 200);
  }
  pass('three synthetic admins retain global read/write');
  assert.equal((await api(users[0], `/api/agents/${agents[0]}/telegram`)).status, 200);
  assert.equal((await api(users[0], `/api/agents/${agents[1]}/telegram`)).status, 404);
  const membershipPath = `/api/departments/${departments[1]}/members`;
  assert.equal((await api(users[0], membershipPath)).status, 403);
  assert.equal((await api(users[0], membershipPath, 'POST', { email: users[0].email })).status, 403);
  assert.equal((await api(users[2], membershipPath)).status, 200);
  assert.equal((await api(users[2], membershipPath, 'POST', { email: users[0].email })).status, 201);
  assert.equal((await api(users[0], '/api/agents')).body.agents.length, 2);
  assert.equal((await api(users[2], membershipPath + '?userId=' + users[0].id, 'DELETE')).status, 200);
  assert.equal((await api(users[0], '/api/agents')).body.agents.length, 1);
  pass('async route parameters, membership grant/revoke and Telegram agent access');
  assert.equal((await api(users[0], '/api/agents/chat', 'POST', { agentId: agents[0], message: 'No provider configured' })).status, 409);
  const forged = await api(users[0], '/api/agent-tools', 'POST', { agentId: agents[1], toolId: 'github', operation: 'list_repositories', input: {} }); assert.equal(forged.status, 403);
  pass('missing provider rejected and foreign tool execution rejected');
  assert.equal((await api(users[0], `/api/agents?id=${agents[0]}`, 'DELETE')).status, 200);
  assert.equal((await api(users[0], '/api/agents')).body.agents.length, 0);
  assert.equal((await api(users[0], '/api/agents', 'PATCH', { id: agents[0], action: 'restore' })).status, 200);
  const history = await api(users[0], `/api/conversations?agentId=${agents[0]}`); assert.equal(history.body.messages.length, 1);
  pass('archive/restore preserves conversation');
  for (const provider of ['github', 'google_drive']) {
    const initiated = await api(users[0], `/api/tool-connections/oauth?provider=${provider}`);
    assert.equal(initiated.status, 200, `OAuth ${provider} configured`);
    const authorization = new URL(initiated.body.authorizationUrl);
    assert.equal(authorization.searchParams.get('redirect_uri'), origin + '/api/tool-connections/oauth/callback');
    const state = authorization.searchParams.get('state'); assert.ok(state);
    const denied = await fetch(origin + '/api/tool-connections/oauth/callback?' + new URLSearchParams({ state, error: 'access_denied' }), { redirect: 'manual' });
    assert.ok(denied.headers.get('location')?.includes('authorization_denied'));
    const replay = await fetch(origin + '/api/tool-connections/oauth/callback?' + new URLSearchParams({ state, error: 'access_denied' }), { redirect: 'manual' });
    assert.ok(replay.headers.get('location')?.includes('oauth_state_invalid'));
  }
  pass('both OAuth starts, denied consent and one-time state replay protection');
  const webhookSecret = randomBytes(32).toString('hex');
  const bot = db(await service.from('telegram_bots').insert({ agent_id: agents[0], owner_user_id: users[0].id, token_ciphertext: 'synthetic-unused', token_iv: 'synthetic-unused', token_auth_tag: 'synthetic-unused', secret_hash: createHash('sha256').update(webhookSecret).digest('hex') }).select('id').single(), 'synthetic bot fixture');
  const update = { update_id: 1, message: { chat: { id: 1 }, from: { first_name: 'Synthetic' }, text: 'Synthetic webhook fixture' } };
  const webhook = (secret) => fetch(origin + `/api/webhook/telegram/${agents[0]}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
  assert.equal((await webhook('invalid')).status, 401);
  assert.equal((await webhook(webhookSecret)).status, 200);
  assert.equal((await webhook(webhookSecret)).status, 200);
  assert.equal(db(await service.from('telegram_updates').select('id').eq('bot_id', bot.id), 'dedup query').length, 1);
  const worker = await fetch(origin + '/api/telegram/worker', { method: 'POST', headers: { 'x-jetree-worker-secret': 'invalid' } }); assert.equal(worker.status, 401);
  pass('Telegram webhook authentication/dedup and worker authorization, synthetic transport');
  browser = await chromium.launch({ headless: true });
  const contexts = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); await page.goto(origin);
    await page.locator('input[type=email]').fill(users[i].email);
    await page.locator('input[type=password]').fill(users[i].password);
    await page.getByRole('button', { name: 'Acceder al Workspace' }).click();
    await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 30000 });
    await page.reload(); await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Herramientas', exact: true }).click();
    await page.getByRole('heading', { name: '🐙 GitHub', exact: true }).waitFor();
    await page.getByRole('heading', { name: '📁 Google Drive', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    assert.ok(!(await page.locator('body').innerText()).includes(`E2E-agent-${1 - i}`), 'browser must not show foreign agent');
    await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
    await page.locator('input[type=password]').waitFor();
    await context.close();
  }
  pass('two isolated browsers: UI login, reload, logout');
  const fresh = createClient(url, key, options);
  const again = db(await fresh.auth.signInWithPassword({ email: users[0].email, password: users[0].password }), 'second device login');
  const persisted = await api({ token: again.session.access_token }, `/api/conversations?agentId=${agents[0]}`); assert.equal(persisted.body.messages.length, 1);
  db(await fresh.auth.signOut(), 'second device logout');
  pass('new session recovers persisted conversation');
  console.log(`Verified ${checks} real Auth E2E groups; no live provider inference or OAuth consent performed.`);
} finally {
  await browser?.close();
  for (const user of users) await user.client.auth.signOut();
  for (const user of users) {
    for (const table of ['tasks', 'activity_logs']) db(await service.from(table).delete().eq(table === 'tasks' ? 'created_by' : 'user_id', user.id), `cleanup ${table}`);
  }
  for (const id of departments) db(await service.from('departments').delete().eq('id', id), 'cleanup synthetic department');
  for (const user of users) db(await service.auth.admin.deleteUser(user.id), 'cleanup synthetic Auth user');
  console.log('Synthetic users, sessions and business fixtures cleaned up.');
}
