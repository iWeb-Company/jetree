import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true'); assert.equal(process.env.CI, 'true');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const origin = process.env.JETREE_APP_URL; assert.equal(new URL(origin).hostname, '127.0.0.1');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const users = []; let department; let browser;
function encrypt(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY, 'base64'), iv); return { ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), iv: iv.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') }; }
async function api(user, path, body) { const r = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; }
async function upload(user, agentId, bytes = png) { const r = await fetch(origin + '/api/chat-images?agentId=' + agentId, { method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'image/png' }, body: bytes }); return { status: r.status, body: await r.json() }; }
async function media(user, imageId) { return fetch(origin + '/api/chat-images?id=' + imageId, { headers: { Authorization: `Bearer ${user.token}` } }); }
async function events() { return (await readFile('artifacts/image-fixture-events.jsonl', 'utf8')).trim().split('\n').map(line => JSON.parse(line)); }
try {
  await rm('artifacts/image-fixture-events.jsonl', { force: true });
  for (let n = 0; n < 3; n++) {
    const email = `images-${randomBytes(8).toString('hex')}@example.invalid`; const password = randomBytes(24).toString('base64url') + '!Aa1';
    const user = db(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const session = db(await client.auth.signInWithPassword({ email, password })).session; users.push({ id: user.id, email, password, token: session.access_token });
    for (const [provider, key] of [['gemini', 'AIzaSynthetic-images'], ['openai', 'sk-proj-synthetic-images'], ['custom', 'sk-or-v1-synthetic-images']]) {
      const secret = encrypt(key); db(await service.rpc('save_provider_api_connection', { owner_id: user.id, detected_provider: provider, encrypted_value: secret.ciphertext, encrypted_iv: secret.iv, encrypted_tag: secret.auth_tag }));
    }
  }
  const [own, member, outsider] = users;
  department = db(await service.from('departments').insert({ name: 'Images CI', created_by: own.id }).select('id').single());
  db(await service.from('department_members').insert({ department_id: department.id, user_id: member.id }));
  const agent = db(await service.from('agents').insert({ department_id: department.id, created_by: own.id, name: 'Images CI', provider: 'gemini', model: 'images-ci-vision', vision_model: 'images-ci-vision', image_model: 'images-ci-generation' }).select('id').single());
  assert.equal((await upload(outsider, agent.id)).status, 404);
  assert.equal((await upload(own, agent.id, Buffer.from('<svg/>'))).status, 400);
  assert.equal((await upload(own, agent.id, Buffer.alloc(768 * 1024 + 1))).status, 413);
  const uploaded = await upload(own, agent.id); assert.equal(uploaded.status, 201); const imageId = uploaded.body.image.id;
  assert.equal((await media(member, imageId)).status, 404); assert.equal((await media(outsider, imageId)).status, 404);
  assert.equal((await api(member, '/api/agents/chat', { agentId: agent.id, imageId, message: 'Qué ves?' })).status, 404, 'A member cannot consume another user pending image');
  const chat = await api(own, '/api/agents/chat', { agentId: agent.id, imageId, message: 'Qué ves?' }); assert.equal(chat.status, 200, chat.body.error); assert.match(chat.body.reply, /Synthetic image understood/); assert.match(chat.body.reply, /Consejo de modelos/);
  assert.equal((await media(member, imageId)).status, 200); assert.equal((await media(outsider, imageId)).status, 404);
  assert.notEqual((await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/chat-images/' + own.id + '/' + imageId + '.png')).status, 200, 'Private bucket must not serve public objects');
  const history = await api(own, '/api/conversations?agentId=' + agent.id); assert.equal(history.body.messages[0].images[0].id, imageId);
  const followup = await api(own, '/api/agents/chat', { agentId: agent.id, conversationId: chat.body.conversationId, message: 'Y de qué color es?' }); assert.equal(followup.status, 200); assert.match(followup.body.reply, /Synthetic image understood/);
  const textAfterImage=await api(own,'/api/agents/chat',{agentId:agent.id,conversationId:chat.body.conversationId,message:'Buscá documentación pública de Cloudflare Workers.'});assert.equal(textAfterImage.status,200);assert.doesNotMatch(textAfterImage.body.reply,/Consejo de modelos/);assert.equal((await events()).at(-1).references,0,'Text request never forwards historical images');
  for (const provider of ['gemini', 'openai', 'custom']) {
    db(await service.from('agents').update({ image_provider: provider }).eq('id', agent.id));
    const result = await api(own, '/api/agents/chat', { agentId: agent.id, conversationId: chat.body.conversationId, message: 'Generá una imagen de un gato' }); assert.equal(result.status, 200, result.body.error); assert.equal(result.body.images.length, 1);
    assert.equal((await media(own, result.body.images[0].id)).status, 200); assert.equal(result.body.generatedImage, undefined, 'No raw bytes in JSON');
  }
  const specialist = db(await service.from('agents').insert({ department_id: department.id, created_by: own.id, name: 'Image subordinate', provider: 'gemini', model: 'images-ci-vision' }).select('id').single());
  db(await service.from('agents').update({ role_type: 'manager', subordinate_ids: [specialist.id] }).eq('id', agent.id));
  const managerImage = await upload(own, agent.id);
  const manager = await api(own, '/api/agents/chat', { agentId: agent.id, imageId: managerImage.body.image.id, message: 'Analizá esta imagen' }); assert.equal(manager.status, 200, manager.body.error); assert.match(manager.body.reply, /Synthetic manager image understood/);
  db(await service.from('agents').update({ role_type: 'independent', subordinate_ids: [], image_provider: 'gemini' }).eq('id', agent.id));
  const secret = encrypt('synthetic-audio-token'); const webhook = 'synthetic-images-webhook';
  const bot = db(await service.from('telegram_bots').insert({ agent_id: agent.id, owner_user_id: own.id, token_ciphertext: secret.ciphertext, token_iv: secret.iv, token_auth_tag: secret.auth_tag, secret_hash: createHash('sha256').update(webhook).digest('hex') }).select('id').single());
  const post = body => fetch(origin + '/api/webhook/telegram/' + agent.id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': webhook }, body: JSON.stringify(body) });
  async function wait(id, expected) {
    for (let n = 0; n < 150; n++) { const row = db(await service.from('telegram_updates').select('*').eq('bot_id', bot.id).eq('update_id', id).maybeSingle()); if (row?.status === expected && (expected !== 'delivery_pending' || !row.locked_at)) return row; if (row?.status === 'failed') throw new Error(row.last_error); await new Promise(resolve => setTimeout(resolve, 200)); } throw new Error('Image queue did not complete');
  }
  const photo = { update_id: 9101, message: { chat: { id: 778899, type: 'private' }, from: { id: 777 }, photo: [{ file_id: 'synthetic_image_photo', width: 10, height: 10 }], caption: 'Qué ves?' } };
  assert.equal((await post(photo)).status, 200); const received = await wait(9101, 'completed'); assert.ok(received.input_image_id); assert.match(received.response_text, /Synthetic image understood/);
  await post(photo); await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(db(await service.from('messages').select('id').eq('telegram_update_id', received.id)).length, 1);
  const generate = { update_id: 9102, message: { chat: { id: 445566, type: 'private' }, from: { id: 777 }, text: '/imagen un gato' } };
  const before = (await events()).filter(event => event.operation === 'generate').length;
  await post(generate); const pending = await wait(9102, 'delivery_pending'); assert.ok(pending.response_image_id); assert.equal(pending.image_delivery_started, false);
  db(await service.from('telegram_updates').update({ next_attempt_at: new Date().toISOString() }).eq('id', pending.id));
  assert.equal((await fetch(origin + '/api/telegram/worker', { method: 'POST', headers: { 'x-jetree-worker-secret': process.env.JETREE_TELEGRAM_WORKER_SECRET } })).status, 200);
  const sent = await wait(9102, 'completed'); assert.equal(sent.image_sent, true); assert.equal((await events()).filter(event => event.operation === 'generate').length, before + 1, 'Delivery retry must reuse saved image');
  await post(generate); await new Promise(resolve => setTimeout(resolve, 300));
  const telegramEvents = (await readFile('artifacts/telegram-fixture-events.jsonl', 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(telegramEvents.filter(event => event.operation === 'sendPhoto' && event.chatId === '445566').length, 2, 'One rejected send plus exactly one successful send');
  assert.equal((await events()).filter(event => event.operation === 'generate').length, before + 1);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await context.newPage();
  await page.goto(origin); await page.locator('input[type=email]').fill(own.email); await page.locator('input[type=password]').fill(own.password); await page.getByRole('button', { name: 'Acceder al Workspace' }).click();
  await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Agentes IA', exact: true }).click();
  await page.getByRole('button', { name: '💬 Hablar', exact: true }).first().click();
  await page.getByAltText('Imagen generada por el agente').first().waitFor();
  await page.screenshot({ path: 'artifacts/chat-images-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'artifacts/chat-images-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS private image uploads and department isolation, vision with history, manager vision, three generation transports, Telegram photos, saved-image delivery retry and desktop/mobile UI');
} finally {
  await browser?.close();
  if (department) { const images = db(await service.from('chat_images').select('object_path').in('owner_user_id', users.map(user => user.id))); if (images.length) db(await service.storage.from('chat-images').remove(images.map(image => image.object_path))); db(await service.from('tasks').delete().eq('department_id', department.id)); db(await service.from('departments').delete().eq('id', department.id)); }
  for (const user of users) db(await service.auth.admin.deleteUser(user.id));
}
