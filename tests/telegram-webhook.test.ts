import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractTelegramTextUpdate, verifyTelegramSecret } from '../src/lib/telegram-webhook';

test('webhook authentication accepts only the matching Telegram secret', () => {
  const secret = 'secret-token-for-test';
  const hash = createHash('sha256').update(secret).digest('hex');
  assert.equal(verifyTelegramSecret(hash, secret), true);
  assert.equal(verifyTelegramSecret(hash, 'different-secret'), false);
  assert.equal(verifyTelegramSecret('not-a-hash', secret), false);
});

test('Telegram text updates are normalized and bounded before queueing', () => {
  assert.deepEqual(extractTelegramTextUpdate({
    update_id: 42,
    message: { chat: { id: 123 }, from: { username: 'facu' }, text: ' hola ' },
  }), { updateId: 42, chatId: 123, senderName: 'facu', text: 'hola' });
  assert.equal(extractTelegramTextUpdate({ update_id: 42, message: { chat: { id: 123 }, text: ' ' } }), null);
  assert.equal(extractTelegramTextUpdate({ update_id: 42, message: { chat: { id: 123 }, text: 'x'.repeat(8001) } }), null);
  assert.equal(extractTelegramTextUpdate({ update_id: 42, callback_query: {} }), null);
});
