import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
assert.equal(process.env.CI, 'true');
const origin = process.env.JETREE_APP_URL || 'http://127.0.0.1:3057';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.equal(new URL(url).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = []; let browser;
function db(result) { assert.equal(result.error, null, result.error?.message); return result.data; }
async function api(user, path, method = 'GET', body) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `jetree-api-${randomBytes(8).toString('hex')}@example.invalid`;
    const password = randomBytes(24).toString('base64url') + '!Aa1';
    const user = db(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
    users.push({ ...user, email, password, token: db(await client.auth.signInWithPassword({ email, password })).session.access_token });
  }
  const own = users[0]; const other = users[1];
  const prefixes = ['AIzaSynthetic-', 'sk-ant-api03-synthetic-', 'sk-proj-synthetic-', 'sk-or-v1-synthetic-', 'sk-synthetic-deepseek-', 'gsk_synthetic-'];
  const providers = ['gemini', 'claude', 'openai', 'custom', 'deepseek', 'groq'];
  const connections = [];
  for (let i = 0; i < prefixes.length; i++) {
    const key = prefixes[i] + randomBytes(12).toString('hex');
    const result = await api(own, '/api/provider-connections', 'POST', { apiKey: key });
    assert.equal(result.status, 200, `Detect ${providers[i]}: ${result.body.code || result.body.error || result.status}`); assert.equal(result.body.connection.provider, providers[i]);
    assert.equal(JSON.stringify(result.body).includes(key), false);
    const stored = db(await service.from('provider_connection_secrets').select('ciphertext').eq('connection_id', result.body.connection.id).single());
    assert.notEqual(stored.ciphertext, key); connections.push(result.body.connection);
    assert.equal((await api(own, '/api/provider-models?provider=' + providers[i])).status, 200);
  }
  for (let i = 0; i < 2; i++) {
    const saved = await api(own, '/api/provider-connections', 'POST', { apiKey: 'AIzaSynthetic-' + randomBytes(12).toString('hex') });
    assert.equal(saved.status, 200); connections.push(saved.body.connection);
  }
  assert.equal((await api(own, '/api/provider-connections')).body.connections.length, 8);
  assert.equal((await api(other, '/api/provider-connections')).body.connections.length, 0);
  const second = connections[6];
  assert.equal((await api(other, '/api/provider-connections', 'POST', { action: 'select', connectionId: second.id })).status, 404);
  assert.equal((await api(other, '/api/provider-connections', 'POST', { action: 'validate', connectionId: second.id })).status, 404);
  await api(other, '/api/provider-connections?id=' + second.id, 'DELETE');
  assert.equal((await api(own, '/api/provider-connections')).body.connections.length, 8);
  assert.equal((await api(other, '/api/provider-models?provider=gemini&connectionId=' + second.id)).status, 409);
  assert.equal((await api(own, '/api/provider-connections', 'POST', { action: 'select', connectionId: second.id })).status, 200);
  const selected = (await api(own, '/api/provider-connections')).body.connections.filter(c => c.provider === 'gemini' && c.metadata.is_default);
  assert.equal(selected.length, 1); assert.equal(selected[0].id, second.id);
  assert.equal((await api(own, '/api/provider-connections', 'POST', { apiKey: 'sk-proj-synthetic-invalid' })).status, 422);
  assert.equal((await api(own, '/api/provider-connections', 'POST', { apiKey: 'not-an-api-key' })).status, 422);
  assert.equal((await api(own, '/api/provider-connections', 'POST', { apiKey: 'x'.repeat(9000) })).status, 413);
  assert.equal((await api(own, '/api/provider-connections')).body.connections.length, 8);
  await api(own, '/api/provider-connections?id=' + second.id, 'DELETE');
  assert.equal((await api(own, '/api/provider-models?provider=gemini')).status, 409, 'No fallback after selected key deletion');
  assert.equal((await api(own, '/api/provider-connections', 'POST', { action: 'select', connectionId: connections[0].id })).status, 200);
  console.log('PASS six providers, repeated keys, encryption, explicit selection, invalid inputs and cross-user isolation');

  const department = db(await service.from('departments').insert({ name: 'API test', created_by: own.id }).select('id').single());
  const agent = db(await service.from('agents').insert({ department_id: department.id, created_by: own.id, name: 'DeepSeek test', provider: 'deepseek', model: 'synthetic-deepseek' }).select('id').single());
  const chat = await api(own, '/api/agents/chat', 'POST', { agentId: agent.id, message: 'Synthetic test' });
  assert.equal(chat.status, 200); assert.match(chat.body.reply, /Synthetic DeepSeek API OK/);
  assert.equal((await api(own, '/api/agents/chat', 'POST', { agentId: agent.id, message: 'test', modelSource: 'local' })).status, 410);
  for (const path of ['/api/model-devices/relay', '/api/mcp-oauth/token', '/mcp']) assert.equal((await api(own, path, 'POST', {})).status, 410);
  console.log('PASS DeepSeek chat adapter and server-side subscription retirement');
  db(await service.from('agents').update({ provider: 'groq', model: 'synthetic-groq' }).eq('id', agent.id));
  const groqChat = await api(own, '/api/agents/chat', 'POST', { agentId: agent.id, message: 'Groq synthetic test' });
  assert.equal(groqChat.status, 200); assert.match(groqChat.body.reply, /Synthetic Groq API OK/);
  console.log('PASS Groq authenticated catalog, encrypted key and chat');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(origin);
  await page.locator('input[type=email]').fill(own.email);
  await page.locator('input[type=password]').fill(own.password);
  await page.getByRole('button', { name: 'Acceder al Workspace' }).click();
  await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 60000 });
  await page.getByTitle('Administrar conexiones API propias').click();
  const dialog = page.getByRole('dialog', { name: 'Conexiones de modelos' });
  await dialog.getByRole('button', { name: 'Agregar otra clave API' }).waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(), 0);
  await dialog.getByRole('button', { name: 'Agregar otra clave API' }).click();
  assert.equal(await dialog.locator('input[type=password]').count(), 1);
  await dialog.getByLabel('Clave API', { exact: true }).fill('AIzaSynthetic-' + randomBytes(12).toString('hex'));
  await dialog.getByRole('button', { name: 'Conectar clave API' }).click();
  await dialog.getByRole('button', { name: 'Agregar otra clave API' }).waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(), 0);
  await dialog.getByRole('button', { name: 'Agregar otra clave API' }).click();
  assert.equal(await dialog.locator('input[type=password]').count(), 1);
  await dialog.getByLabel('Clave API', { exact: true }).fill('sk-ant-api03-synthetic-' + randomBytes(12).toString('hex'));
  await dialog.getByRole('button', { name: 'Conectar clave API' }).click();
  await dialog.getByRole('button', { name: 'Agregar otra clave API' }).waitFor();
  await mkdir('artifacts', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(dialog.getByRole('button', { name: 'Agregar otra clave API' })).toBeVisible();
    await page.screenshot({ path: `artifacts/api-connections-${viewport.width}.png` });
  }
  console.log('PASS progressive single input, repeat additions and mobile/desktop dialog');
} finally {
  await browser?.close();
  for (const user of users) {
    db(await service.from('departments').delete().eq('created_by', user.id));
    db(await service.from('activity_logs').delete().eq('user_id', user.id));
    db(await service.auth.admin.deleteUser(user.id));
  }
}
