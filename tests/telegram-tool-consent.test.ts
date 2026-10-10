import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractTelegramToolEvent, isTelegramApprovalReply, telegramApprovalKeyboard, telegramToolIdentityMatches } from '../src/lib/telegram-tool-consent';

const id = '12345678-1234-1234-1234-123456789abc';
const callback = { update_id: 1, callback_query: { id: 'callback', data: `jt:a:${id}`, from: { id: 42 }, message: { message_id: 10, chat: { id: 42, type: 'private' } } } };
test('plain approval replies only recover a draft and do not parse arbitrary instructions as consent', () => {
  for (const text of ['aprobado', 'Apruebo!', 'lo apruebo', 'rechazar', 'cancelado.']) assert.equal(isTelegramApprovalReply(text), true);
  for (const text of ['Mandá un correo aprobado', 'aprobado: enviá otro correo', 'ok', 'Buscá videos', '']) assert.equal(isTelegramApprovalReply(text), false);
});
test('Telegram consent accepts only private identified users and structured approval callbacks', () => {
  assert.equal(extractTelegramToolEvent(callback)?.event.kind, 'approval');
  assert.equal(extractTelegramToolEvent({ ...callback, callback_query: { ...callback.callback_query, data: 'approve anything' } }), null);
  for (const type of ['group', 'supergroup', 'channel']) assert.equal(extractTelegramToolEvent({ ...callback, callback_query: { ...callback.callback_query, message: { message_id: 10, chat: { id: 42, type } } } }), null);
  assert.equal(extractTelegramToolEvent({ ...callback, callback_query: { ...callback.callback_query, from: { id: 42, is_bot: true } } }), null);
  const keyboard = telegramApprovalKeyboard(id).inline_keyboard[0];
  assert.equal(keyboard[0].callback_data, `jt:a:${id}`);
  assert.ok(Buffer.byteLength(keyboard[0].callback_data) <= 64);
});
test('a pairing command stores a hash only and rejects edited, group and malformed commands', () => {
  const code = 'a'.repeat(48);
  const message = { from: { id: 42 }, chat: { id: 42, type: 'private' }, text: `/vincular ${code}` };
  const parsed = extractTelegramToolEvent({ update_id: 1, message });
  assert.deepEqual(parsed?.event, { kind: 'pair', hash: createHash('sha256').update(code).digest('hex') });
  assert.ok(!JSON.stringify(parsed).includes(code));
  assert.equal(extractTelegramToolEvent({ update_id: 1, edited_message: message }), null);
  assert.equal(extractTelegramToolEvent({ update_id: 1, message: { ...message, text: '/vincular short' } }), null);
});
test('tool access requires both the linked Telegram user and the linked private chat', () => {
  const bot = { tool_chat_id: '42', tool_user_id: '42' };
  assert.equal(telegramToolIdentityMatches(bot, { chat_id: 42, sender_user_id: 42, chat_type: 'private' }), true);
  for (const update of [{ chat_id: 43, sender_user_id: 42, chat_type: 'private' }, { chat_id: 42, sender_user_id: 43, chat_type: 'private' }, { chat_id: 42, sender_user_id: 42, chat_type: 'group' }, { chat_id: 42, chat_type: 'private' }]) assert.equal(telegramToolIdentityMatches(bot, update), false);
  assert.equal(telegramToolIdentityMatches({}, { chat_id: 42, sender_user_id: 42, chat_type: 'private' }), false);
});
