import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true'); assert.equal(process.env.CI, 'true');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const origin = process.env.JETREE_APP_URL; assert.equal(new URL(origin).hostname, '127.0.0.1');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = r => { assert.equal(r.error, null, r.error?.message); return r.data; };
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY, 'base64'), iv);
  return { ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), iv: iv.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') };
}
let user, department;
try {
  await rm('artifacts/telegram-fixture-events.jsonl', { force: true });
  user = db(await service.auth.admin.createUser({ email: `audio-${randomBytes(8).toString('hex')}@example.invalid`, password: randomBytes(24).toString('base64url')+'!Aa1', email_confirm: true })).user;
  department = db(await service.from('departments').insert({ name: 'Audio CI', created_by: user.id }).select('id').single());
  const agent = db(await service.from('agents').insert({ department_id: department.id, created_by: user.id, name: 'Audio CI', provider: 'deepseek', model: 'synthetic-deepseek' }).select('id').single());
  for (const [provider, key] of [['gemini', 'AIzaSynthetic-audio'], ['deepseek', 'sk-synthetic-deepseek-audio']]) {
    const secret = encrypt(key); db(await service.rpc('save_provider_api_connection', { owner_id: user.id, detected_provider: provider, encrypted_value: secret.ciphertext, encrypted_iv: secret.iv, encrypted_tag: secret.auth_tag }));
  }
  const botSecret = encrypt('synthetic-audio-token'); const webhookSecret = 'synthetic-audio-webhook';
  const bot = db(await service.from('telegram_bots').insert({ agent_id: agent.id, owner_user_id: user.id, token_ciphertext: botSecret.ciphertext, token_iv: botSecret.iv, token_auth_tag: botSecret.auth_tag, secret_hash: createHash('sha256').update(webhookSecret).digest('hex') }).select('id').single());
  const post = body => fetch(origin + '/api/webhook/telegram/' + agent.id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret }, body: JSON.stringify(body) });
  const update = { update_id: 9001, message: { chat: { id: 12345 }, voice: { file_id: 'synthetic_audio', duration: 3, file_size: 4 } } };
  const started = Date.now(); assert.equal((await post(update)).status, 200);
  assert.ok(Date.now() - started < 5000, 'Webhook ACK must not await inference');
  async function waitStatus(id, expected) {
    for (let n = 0; n < 100; n++) {
      const row = db(await service.from('telegram_updates').select('*').eq('bot_id', bot.id).eq('update_id', id).maybeSingle());
      if (row?.status === expected) return row;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Immediate webhook processing did not finish');
  }
  const completed = await waitStatus(9001, 'completed');
  assert.equal(completed.audio_transcript, 'Respondé: audio comprendido'); assert.equal(completed.response_text, 'Synthetic audio understood');
  assert.equal(db(await service.from('messages').select('id').eq('telegram_update_id', completed.id)).length, 1);
  assert.equal((await post(update)).status, 200); await new Promise(resolve => setTimeout(resolve, 500));
  const events = (await readFile('artifacts/telegram-fixture-events.jsonl','utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(e=>e.operation==='getFile').length, 1); assert.equal(events.filter(e=>e.operation==='sendMessage').length, 1); assert.ok(events.some(e=>e.operation==='sendChatAction'));
  const oversized = { ...update, update_id: 9002, message: { ...update.message, voice: { file_id: 'synthetic_too_large', duration: 301 } } };
  assert.equal((await post(oversized)).status, 200); const rejected = await waitStatus(9002,'failed'); assert.equal(rejected.last_error,'AUDIO_TOO_LARGE');
  const retry = { ...update, update_id: 9003, message: { ...update.message, chat: { id: 54321 } } };
  assert.equal((await post(retry)).status, 200);
  const pending = await waitStatus(9003,'delivery_pending');
  // Wait for failed delivery to release its lock before explicitly waking the scheduler.
  for (let n = 0; n < 50; n++) {
    const row = db(await service.from('telegram_updates').select('locked_at,last_error').eq('id',pending.id).single());
    if (!row.locked_at && row.last_error === 'TELEGRAM_DELIVERY_FAILED') break;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  db(await service.from('telegram_updates').update({ next_attempt_at: new Date().toISOString() }).eq('id',pending.id));
  assert.equal((await fetch(origin+'/api/telegram/worker', { method:'POST', headers:{ 'x-jetree-worker-secret':process.env.JETREE_TELEGRAM_WORKER_SECRET } })).status,200);
  await waitStatus(9003,'completed');
  const afterRetry = (await readFile('artifacts/telegram-fixture-events.jsonl','utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(afterRetry.filter(e=>e.operation==='getFile').length,2,'Delivery retry must not redownload or retranscribe audio');
  assert.equal(db(await service.from('messages').select('id').eq('telegram_update_id',pending.id)).length,1);
  assert.equal(db(await service.from('agent_executions').select('id').eq('conversation_id',db(await service.from('telegram_chat_sessions').select('conversation_id').eq('bot_id',bot.id).eq('chat_id',54321).single()).conversation_id)).length,1,'Delivery retry must not rerun inference');
  console.log('PASS immediate webhook processing, voice transcription, typing, deduplication, oversized rejection and cached delivery retry');
} finally {
  if (department) {
    // Remove task assignments before deleting their agents (the DB validates every assignment).
    db(await service.from('tasks').delete().eq('department_id',department.id));
    db(await service.from('departments').delete().eq('id',department.id));
  }
  if (user) db(await service.auth.admin.deleteUser(user.id));
}
