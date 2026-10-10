import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true'); assert.equal(process.env.CI, 'true');
const origin = process.env.JETREE_APP_URL; assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const db = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
const hash = value => createHash('sha256').update(value).digest('hex');
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY, 'base64'), iv);
  return { ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), iv: iv.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') };
}
let user, browser;
try {
  await rm('artifacts/gmail-fixture-events.jsonl', { force: true });
  await rm('artifacts/telegram-fixture-events.jsonl', { force: true });
  const email = `telegram-tools-${randomBytes(8).toString('hex')}@example.invalid`; const password = randomBytes(24).toString('base64url') + '!Aa1';
  user = db(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const token = db(await client.auth.signInWithPassword({ email, password })).session.access_token;
  const api = (path, method = 'GET', body) => fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const department = db(await service.from('departments').insert({ name: 'Telegram tools CI', created_by: user.id }).select('id').single());
  const specialist = db(await service.from('agents').insert({ department_id: department.id, created_by: user.id, name: 'Telegram specialist CI', provider: 'custom', model: 'synthetic-custom:free', enabled_tool_ids: ['plugin-gmail-core', 'plugin-web-search'] }).select('id').single());
  const manager = db(await service.from('agents').insert({ department_id: department.id, created_by: user.id, name: 'Telegram manager CI', role_type: 'manager', subordinate_ids: [specialist.id], provider: 'custom', model: 'synthetic-custom:free', enabled_tool_ids: ['plugin-gmail-core'] }).select('id').single());
  const key = encrypt('sk-or-v1-synthetic-telegram-tools');
  db(await service.rpc('save_provider_api_connection', { owner_id: user.id, detected_provider: 'custom', encrypted_value: key.ciphertext, encrypted_iv: key.iv, encrypted_tag: key.auth_tag }));
  const oauth = await (await api('/api/tool-connections/oauth?provider=gmail')).json();
  const state = new URL(oauth.authorizationUrl).searchParams.get('state');
  const callback = await fetch(origin + '/api/tool-connections/oauth/callback?' + new URLSearchParams({ state, code: 'synthetic-gmail-code' }), { redirect: 'manual' });
  assert.ok(callback.headers.get('location')?.includes('tool_connection=connected'));
  const botSecret = encrypt('synthetic-audio-token'); const webhookSecret = 'synthetic-tools-webhook'; const pairCode = randomBytes(24).toString('hex');
  const bot = db(await service.from('telegram_bots').insert({ agent_id: manager.id, owner_user_id: user.id, bot_username: 'SyntheticTools_bot', token_ciphertext: botSecret.ciphertext, token_iv: botSecret.iv, token_auth_tag: botSecret.auth_tag, secret_hash: hash(webhookSecret), tool_pair_hash: hash(pairCode), tool_pair_expires_at: new Date(Date.now() + 600000).toISOString() }).select('id').single());
  let nextId = 9100;
  const post = body => fetch(origin + '/api/webhook/telegram/' + manager.id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret }, body: JSON.stringify(body) });
  async function wait(id) {
    for (let n = 0; n < 150; n++) {
      const row = db(await service.from('telegram_updates').select('*').eq('bot_id', bot.id).eq('update_id', id).maybeSingle());
      if (row?.status === 'completed') return row;
      if (row?.status === 'failed') throw new Error('Tool fixture failed: ' + row.last_error);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Tool update did not complete');
  }
  async function say(text, chatId = 42, senderId = chatId, type = 'private') {
    const id = ++nextId;
    const response = await post({ update_id: id, message: { chat: { id: chatId, type }, from: { id: senderId }, text } });
    assert.equal(response.status, 200); return wait(id);
  }
  async function decide(approvalId, decision, chatId = 42, senderId = chatId) {
    const id = ++nextId;
    const response = await post({ update_id: id, callback_query: { id: `callback-${id}`, data: `jt:${decision}:${approvalId}`, from: { id: senderId }, message: { message_id: 10, chat: { id: chatId, type: 'private' } } } });
    assert.equal(response.status, 200); return wait(id);
  }
  const unlinked = await say('[Telegram tools CI] Leé el correo sintético'); assert.match(unlinked.response_text, /Vinculá/);
  assert.equal(db(await service.from('agent_tool_calls').select('id').eq('user_id', user.id)).length, 0);
  db(await service.from('telegram_bots').update({ tool_pair_expires_at: new Date(0).toISOString() }).eq('id', bot.id));
  assert.match((await say(`/vincular ${pairCode}`)).response_text, /venció/);
  db(await service.from('telegram_bots').update({ tool_pair_expires_at: new Date(Date.now() + 600000).toISOString() }).eq('id', bot.id));
  const paired = await say(`/vincular ${pairCode}`); assert.match(paired.response_text, /Chat vinculado/); assert.ok(!paired.message_text.includes(pairCode));
  assert.equal(db(await service.from('telegram_bots').select('tool_pair_hash').eq('id', bot.id).single()).tool_pair_hash, null);
  assert.match((await say(`/vincular ${pairCode}`, 43)).response_text, /venció|usado/);
  assert.match((await say('[Telegram tools CI] Leé el correo sintético')).response_text, /Synthetic email text/);
  assert.match((await say('[Telegram tools CI] Buscá videos')).response_text, /Synthetic video found/);
  const draft = await say('[Telegram tools CI] Mandá un correo de prueba'); assert.ok(draft.pending_approval_id); assert.match(draft.response_text, /recipient@example.invalid/);
  let approval = db(await service.from('agent_tool_approvals').select('status').eq('id', draft.pending_approval_id).single()); assert.equal(approval.status, 'pending');
  assert.match((await decide(draft.pending_approval_id, 'a', 43)).response_text, /no pertenece/);
  assert.match((await decide(draft.pending_approval_id, 'a', 42, 43)).response_text, /no pertenece/);
  const groupCallback = await post({ update_id: ++nextId, callback_query: { id: 'group', data: `jt:a:${draft.pending_approval_id}`, from: { id: 42 }, message: { message_id: 10, chat: { id: 42, type: 'group' } } } });
  assert.equal((await groupCallback.json()).ignored, true);
  assert.equal(db(await service.from('agent_tool_approvals').select('status').eq('id', draft.pending_approval_id).single()).status, 'pending');
  assert.match((await decide(draft.pending_approval_id, 'a')).response_text, /ejecutada/);
  assert.match((await decide(draft.pending_approval_id, 'a')).response_text, /ya fue resuelta/);
  const second = await say('[Telegram tools CI] Mandá un correo de prueba');
  assert.match((await decide(second.pending_approval_id, 'r')).response_text, /rechazada/);
  const third = await say('[Telegram tools CI] Mandá un correo de prueba');
  db(await service.from('agents').update({ enabled_tool_ids: [] }).eq('id', specialist.id));
  assert.match((await decide(third.pending_approval_id, 'a')).response_text, /no tiene permiso/);
  db(await service.from('agents').update({ enabled_tool_ids: ['plugin-gmail-core', 'plugin-web-search'] }).eq('id', specialist.id));
  const events = (await readFile('artifacts/gmail-fixture-events.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e => e.method === 'POST').length, 1, 'Only the single approved draft may send mail');
  const telegramEvents = (await readFile('artifacts/telegram-fixture-events.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
  const card = telegramEvents.find(e => e.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data === `jt:a:${draft.pending_approval_id}`); assert.ok(card, 'Chat receives approval buttons');
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  await page.goto(origin); await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Acceder al Workspace' }).click(); await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Agentes IA', exact: true }).click(); await page.locator('[title="Gestionar Bot de Telegram"]').click();
  await expect(page.getByText('Chat autorizado. Podés aprobar acciones desde Telegram.', { exact: true })).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.getByRole('heading', { name: 'Herramientas y aprobaciones por Telegram' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/telegram-tools-${width}.png`, fullPage: true }); }
  const revoke = await api(`/api/agents/${manager.id}/telegram`, 'POST', { action: 'unlink_tools' }); assert.equal(revoke.status, 200);
  assert.match((await say('[Telegram tools CI] Leé el correo sintético')).response_text, /revocado/);
  const deniedClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  assert.ok((await deniedClient.from('telegram_tool_approvals').select('*')).error, 'Client cannot inspect approval chat bindings');
  console.log('PASS Telegram pairing, conversation tools, delegation, approve/reject, replay and identity isolation, disabled tool, revoked history and responsive UI');
} finally {
  await browser?.close();
  if (user) { db(await service.from('tasks').delete().eq('created_by', user.id)); db(await service.from('departments').delete().eq('created_by', user.id)); db(await service.from('activity_logs').delete().eq('user_id', user.id)); db(await service.auth.admin.deleteUser(user.id)); }
}
