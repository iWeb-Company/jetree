import { MAX_IMAGE_BYTES } from '@/lib/chat-images';
import { readChatImage } from './chat-image-store';
import type { getServiceSupabase } from './auth';

export type TelegramImage = { fileId: string; size?: number };
export async function downloadTelegramImage(token: string, image: TelegramImage, fetcher: typeof fetch = fetch) {
  if (image.size !== undefined && (!Number.isFinite(image.size) || image.size < 1 || image.size > MAX_IMAGE_BYTES)) throw new Error('IMAGE_TOO_LARGE');
  const metadata = await fetcher(`https://api.telegram.org/bot${token}/getFile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: image.fileId }), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const result = await metadata.json().catch(() => null); const path = result?.result?.file_path;
  if (!metadata.ok || !result?.ok || typeof path !== 'string' || !/^[\w./-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('IMAGE_DOWNLOAD_FAILED');
  if (Number(result.result.file_size) > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const response = await fetcher(`https://api.telegram.org/file/bot${token}/${path}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error('IMAGE_DOWNLOAD_FAILED');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) { await response.body.cancel(); throw new Error('IMAGE_TOO_LARGE'); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('IMAGE_TOO_LARGE'); } chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

// Telegram has no idempotency key: never resend a photo after an ambiguous result.
export async function deliverTelegramImage(service: ReturnType<typeof getServiceSupabase>, token: string, update: any, fetcher: typeof fetch = fetch) {
  if (!update.response_image_id || update.image_sent) return;
  if (update.image_delivery_started) throw new Error('IMAGE_DELIVERY_UNCERTAIN');
  const { data: row, error } = await service.from('chat_images').select('*').eq('id', update.response_image_id).eq('agent_id', update.agent_id).maybeSingle();
  if (error || !row) throw new Error('IMAGE_STORAGE_FAILED');
  const image = await readChatImage(service, row);
  const { error: startError } = await service.from('telegram_updates').update({ image_delivery_started: true }).eq('id', update.id);
  if (startError) throw new Error('IMAGE_STORAGE_FAILED');
  update.image_delivery_started = true;
  const body = new FormData(); body.set('chat_id', String(update.chat_id)); body.set('photo', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), 'jetree.png'); body.set('caption', update.response_text.slice(0, 1024));
  let response: Response;
  try { response = await fetcher(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('IMAGE_DELIVERY_UNCERTAIN'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    if (result?.ok === false) {
      const { error: resetError } = await service.from('telegram_updates').update({ image_delivery_started: false }).eq('id', update.id);
      if (resetError) throw new Error('IMAGE_DELIVERY_UNCERTAIN');
      update.image_delivery_started = false;
      throw new Error('TELEGRAM_IMAGE_DELIVERY_FAILED');
    }
    throw new Error('IMAGE_DELIVERY_UNCERTAIN');
  }
  const { error: saveError } = await service.from('telegram_updates').update({ image_sent: true, response_text_sent: true }).eq('id', update.id);
  if (saveError) throw new Error('IMAGE_DELIVERY_UNCERTAIN');
  update.image_sent = true; update.response_text_sent = true;
}
