import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
const origin = process.env.JETREE_E2E_APP_URL || 'http://127.0.0.1:3057';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(origin).hostname, '127.0.0.1'); assert.equal(new URL(url).hostname, '127.0.0.1');
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const users = []; const departments = []; let browser;
const db = (result) => { assert.equal(result.error, null, result.error?.message); return result.data; };
async function request(path, method = 'GET', body, token) {
  const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(path === '/mcp' ? { Accept: 'application/json, text/event-stream' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const rpc = (token, name, args = {}) => request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, token);
async function exchange(params) {
  const response = await fetch(origin + '/api/mcp-oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'jetree-claude', resource: origin + '/mcp', ...params }) });
  return { status: response.status, body: await response.json() };
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `jetree-connectors-${randomBytes(8).toString('hex')}@example.invalid`; const password = randomBytes(24).toString('base64url') + '!Aa1';
    const user = db(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    users.push({ ...user, client, email, password });
    const session = db(await client.auth.signInWithPassword({ email, password })).session;
    users[i].token = session.access_token;
    const department = db(await service.from('departments').insert({ name: 'Connector E2E', created_by: user.id }).select('id').single()); departments.push(department.id);
    users[i].agent = db(await service.from('agents').insert({ department_id: department.id, created_by: user.id, name: `Connector agent ${i}`, provider: 'gemini', model: 'synthetic', enabled_tool_ids: ['plugin-github-core'] }).select('id').single()).id;
  }
  const registration = await request('/api/mcp-oauth/register', 'POST', { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }); assert.equal(registration.status, 201);
  assert.equal((await request('/api/mcp-oauth/register', 'POST', { redirect_uris: ['https://evil.example.test/'] })).status, 400);
  const verifier = randomBytes(48).toString('base64url');
  const query = new URLSearchParams({ client_id: 'jetree-claude', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', response_type: 'code', resource: origin + '/mcp', scope: 'jetree:read jetree:request-write', state: 'synthetic-e2e', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  assert.equal((await request('/api/mcp-oauth/consent', 'POST', { query: query.toString(), decision: 'approve', agentIds: [users[1].agent] }, users[0].token)).status, 400);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  let callback;
  await page.route('https://claude.ai/api/mcp/auth_callback**', async route => { callback = new URL(route.request().url()); await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Disposable OAuth callback</h1>' }); });
  await page.goto(origin + '/claude/autorizar?' + query);
  await page.getByRole('textbox', { name: 'Correo de Jetree' }).fill(users[0].email);
  await page.getByLabel('Contraseña de Jetree').fill(users[0].password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByText('Connector agent 0', { exact: true }).waitFor();
  assert.equal(await page.getByText('Connector agent 1', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Autorizar agentes seleccionados' }).isEnabled(), false);
  await page.getByRole('checkbox', { name: 'Connector agent 0', exact: true }).check();
  await page.getByRole('checkbox', { name: /Permitir propuestas/ }).check();
  await page.getByRole('button', { name: 'Autorizar agentes seleccionados' }).click();
  await page.getByRole('heading', { name: 'Disposable OAuth callback' }).waitFor();
  assert.equal(callback.searchParams.get('state'), 'synthetic-e2e'); const code = callback.searchParams.get('code');
  assert.equal((await exchange({ grant_type: 'authorization_code', code, code_verifier: 'x'.repeat(64), redirect_uri: query.get('redirect_uri') })).status, 400);
  const tokens = await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: query.get('redirect_uri') }); assert.equal(tokens.status, 200);
  assert.equal((await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: query.get('redirect_uri') })).status, 400);
  assert.equal((await rpc(users[0].token, 'jetree_list_agents')).status, 401, 'Supabase JWT must not be accepted as an MCP token');
  const agents = await rpc(tokens.body.access_token, 'jetree_list_agents'); assert.equal(agents.status, 200); const visible = JSON.parse(agents.body.result.content[0].text).agents; assert.equal(visible.length, 1); assert.equal(visible[0].id, users[0].agent);
  const other = await rpc(tokens.body.access_token, 'jetree_read_tool', { agentId: users[1].agent, toolId: 'plugin-github-core', operation: 'list_repositories', input: {} }); assert.equal(other.body.result.isError, true);
  const input = { owner: 'synthetic', repo: 'synthetic', branch: 'e2e', base: 'main' };
  const invalidWrite = await rpc(tokens.body.access_token, 'jetree_read_tool', { agentId: users[0].agent, toolId: 'plugin-github-core', operation: 'create_branch', input }); assert.equal(invalidWrite.body.result.isError, true);
  const proposed = await rpc(tokens.body.access_token, 'jetree_request_change', { agentId: users[0].agent, toolId: 'plugin-github-core', operation: 'create_branch', input });
  const proposal = JSON.parse(proposed.body.result.content[0].text); assert.equal(proposal.pendingApproval, true); assert.equal(proposal.executed, false);
  const row = db(await service.from('agent_tool_approvals').select('input,status').eq('id', proposal.approvalId).single()); assert.equal(row.status, 'pending'); assert.equal(row.input.branch, 'jetree-branch-e2e');
  assert.equal((await request('/api/agent-tools/approvals', 'POST', { approvalId: proposal.approvalId, decision: 'reject' }, users[0].token)).status, 200);
  assert.equal(JSON.parse((await rpc(tokens.body.access_token, 'jetree_change_status', { approvalId: proposal.approvalId })).body.result.content[0].text).status, 'rejected');
  const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token }); assert.equal(refreshed.status, 200);
  assert.equal((await rpc(tokens.body.access_token, 'jetree_list_agents')).status, 401);
  const connections = await request('/api/mcp-connections', 'GET', undefined, users[0].token); const grant = connections.body.connections[0];
  await request('/api/mcp-connections?id=' + grant.id, 'DELETE', undefined, users[1].token); assert.equal((await rpc(refreshed.body.access_token, 'jetree_list_agents')).status, 200);
  await request('/api/mcp-connections?id=' + grant.id, 'DELETE', undefined, users[0].token); assert.equal((await rpc(refreshed.body.access_token, 'jetree_list_agents')).status, 401);
  const pairing = await request('/api/model-devices', 'POST', {}, users[0].token); assert.equal(pairing.status, 200);
  const device = await request('/api/model-devices/connect', 'POST', { pairingCode: pairing.body.pairingCode, name: 'Synthetic relay' }); assert.equal(device.status, 200);
  assert.equal((await request('/api/model-devices/connect', 'POST', { pairingCode: pairing.body.pairingCode, name: 'Replay' })).status, 409);
  assert.equal((await request('/api/model-devices', 'GET', undefined, users[1].token)).body.devices.length, 0);
  assert.equal((await request('/api/model-devices/relay', 'POST', { action: 'poll' }, device.body.token)).status, 200);
  const devices = (await request('/api/model-devices', 'GET', undefined, users[0].token)).body.devices; assert.equal(devices[0].online, true);
  await request('/api/model-devices?id=' + devices[0].id, 'DELETE', undefined, users[0].token);
  assert.equal((await request('/api/model-devices/relay', 'POST', { action: 'poll' }, device.body.token)).status, 409);
  await context.close();
  console.log('PASS real Auth + mobile consent + PKCE + MCP isolation + approval/rejection + refresh/revocation + personal relay. No live Claude/Google account or external writes used.');
} finally {
  await browser?.close();
  for (const id of departments) db(await service.from('departments').delete().eq('id', id));
  for (const user of users) { await user.client.auth.signOut(); db(await service.auth.admin.deleteUser(user.id)); }
}
