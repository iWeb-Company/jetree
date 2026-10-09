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
  audio?: { fileId: string; mimeType: string; duration: number; size?: number };
} | null {
  if (!body || typeof body !== 'object') return null;
  const update = body as Record<string, any>;
  const message = update.message || update.edited_message;
  if (!Number.isSafeInteger(update.update_id) || !message || !Number.isSafeInteger(message.chat?.id)) return null;
  const media = message.voice || message.audio;
  const audio = media && typeof media.file_id === 'string' && /^[\w-]{1,512}$/.test(media.file_id)
    ? { fileId: media.file_id, mimeType: message.voice ? 'audio/ogg' : String(media.mime_type || 'audio/mpeg'), duration: Number(media.duration), ...(media.file_size !== undefined ? { size: Number(media.file_size) } : {}) } : undefined;
  const text = typeof message.text === 'string' ? message.text.trim() : audio ? (typeof message.caption === 'string' ? message.caption.trim() : '') || '[Audio de Telegram]' : '';
  if (!text || text.length > 8000) return null;
  return {
    updateId: update.update_id,
    chatId: message.chat.id,
    senderName: String(message.from?.username || message.from?.first_name || 'Usuario').slice(0, 120),
    text,
    ...(audio ? { audio } : {}),
  };
}
