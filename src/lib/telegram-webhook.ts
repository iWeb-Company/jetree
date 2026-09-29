import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyTelegramSecret(secretHash: string, suppliedSecret: string): boolean {
  const suppliedHash = createHash('sha256').update(suppliedSecret).digest();
  const storedHash = Buffer.from(secretHash, 'hex');
  return storedHash.length === suppliedHash.length && timingSafeEqual(storedHash, suppliedHash);
}

export function extractTelegramTextUpdate(body: unknown): {
  updateId: number;
  chatId: number;
  senderName: string;
  text: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const update = body as Record<string, any>;
  const message = update.message || update.edited_message;
  if (!Number.isSafeInteger(update.update_id) || !message || !Number.isSafeInteger(message.chat?.id) || typeof message.text !== 'string') return null;
  const text = message.text.trim();
  if (!text || text.length > 8000) return null;
  return {
    updateId: update.update_id,
    chatId: message.chat.id,
    senderName: String(message.from?.username || message.from?.first_name || 'Usuario').slice(0, 120),
    text,
  };
}
