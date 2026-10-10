import { createHash } from 'node:crypto';

export function isTelegramApprovalReply(text: string): boolean {
  return /^(?:aprobado|aprobar|apruebo|lo apruebo|confirmo|confirmado|rechazado|rechazar|rechazo|cancelar|cancelado)[.!\s]*$/i.test(text.trim());
}

export function telegramToolIdentityMatches(bot: { tool_chat_id?: number | string | null; tool_user_id?: number | string | null }, update: { chat_id: number | string; sender_user_id?: number | string | null; chat_type?: string | null }): boolean {
  return update.chat_type === 'private' && Boolean(bot.tool_chat_id && bot.tool_user_id && update.sender_user_id)
    && String(bot.tool_chat_id) === String(update.chat_id) && String(bot.tool_user_id) === String(update.sender_user_id);
}

export type TelegramToolEvent = { kind: 'pair'; hash: string } | { kind: 'approval'; approvalId: string; decision: 'approve' | 'reject'; callbackId: string; messageId: number };

export function extractTelegramToolEvent(body: unknown): { updateId: number; chatId: number; senderUserId: number; chatType: 'private'; event: TelegramToolEvent } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, any>;
  if (!Number.isSafeInteger(value.update_id)) return null;
  const callback = value.callback_query;
  const message = callback?.message || value.message;
  const sender = callback?.from || message?.from;
  if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(sender?.id) || sender.is_bot) return null;
  const base = { updateId: value.update_id, chatId: message.chat.id, senderUserId: sender.id, chatType: 'private' as const };
  if (callback) {
    const match = typeof callback.data === 'string' && /^jt:([ar]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(callback.data);
    if (!match || typeof callback.id !== 'string' || callback.id.length > 150 || !Number.isSafeInteger(message.message_id)) return null;
    return { ...base, event: { kind: 'approval', approvalId: match[2], decision: match[1] === 'a' ? 'approve' : 'reject', callbackId: callback.id, messageId: message.message_id } };
  }
  const match = typeof message.text === 'string' && /^\/vincular\s+([0-9a-f]{48})$/i.exec(message.text.trim());
  return match ? { ...base, event: { kind: 'pair', hash: createHash('sha256').update(match[1]).digest('hex') } } : null;
}

export function telegramApprovalKeyboard(approvalId: string) {
  return { inline_keyboard: [[{ text: '✅ Aprobar y ejecutar', callback_data: `jt:a:${approvalId}` }, { text: '❌ Rechazar', callback_data: `jt:r:${approvalId}` }]] };
}
