import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { getServiceSupabase } from './auth';
import { MAX_IMAGE_BYTES, type ImageInput, type ImageRef } from '@/lib/chat-images';

const BUCKET = 'chat-images';
type Service = ReturnType<typeof getServiceSupabase>;
export async function normalizeImage(bytes: Buffer): Promise<ImageInput> {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('IMAGE_FORMAT_INVALID');
    const output = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    if (output.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    return { bytes: output, mimeType: 'image/png' };
  } catch (error) {
    if (error instanceof Error && /^IMAGE_/.test(error.message)) throw error;
    throw new Error(error instanceof Error && /pixel limit/i.test(error.message) ? 'IMAGE_TOO_LARGE' : 'IMAGE_FORMAT_INVALID');
  }
}
export function imageRef(row: any): ImageRef { return { id: row.id, kind: row.kind, mimeType: row.mime_type }; }
export async function saveChatImage(service: Service, ownerId: string, agentId: string, bytes: Buffer, kind: ImageRef['kind'], messageId?: string): Promise<ImageRef> {
  const image = await normalizeImage(bytes); const id = randomUUID(); const path = `${ownerId}/${id}.png`;
  const { error: uploadError } = await service.storage.from(BUCKET).upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
  if (uploadError) throw new Error('IMAGE_STORAGE_FAILED');
  const { error } = await service.from('chat_images').insert({ id, owner_user_id: ownerId, agent_id: agentId, object_path: path, mime_type: image.mimeType, kind, byte_size: image.bytes.length, message_id: messageId || null });
  if (error) { await service.storage.from(BUCKET).remove([path]); throw new Error('IMAGE_STORAGE_FAILED'); }
  return { id, kind, mimeType: image.mimeType };
}
export async function readChatImage(service: Service, row: any): Promise<ImageInput> {
  if (!row?.object_path || row.byte_size > MAX_IMAGE_BYTES) throw new Error('IMAGE_ACCESS_DENIED');
  const { data, error } = await service.storage.from(BUCKET).download(row.object_path);
  if (error || !data || data.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_STORAGE_FAILED');
  return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: row.mime_type };
}
export async function ownedPendingImage(service: Service, id: string, ownerId: string, agentId: string) {
  const { data, error } = await service.from('chat_images').select('*').eq('id', id).eq('owner_user_id', ownerId).eq('agent_id', agentId).is('message_id', null).eq('kind', 'received').gt('created_at', new Date(Date.now() - 86400000).toISOString()).maybeSingle();
  if (error || !data) throw new Error('IMAGE_ACCESS_DENIED');
  return data;
}
export async function attachChatImage(service: Service, imageId: string, messageId: string) {
  const { data, error } = await service.from('chat_images').update({ message_id: messageId }).eq('id', imageId).is('message_id', null).select('id').maybeSingle();
  if (error || !data) throw new Error('IMAGE_ACCESS_DENIED');
}
export async function recentConversationImages(service: Service, conversationId: string, currentIds: string[] = []): Promise<ImageInput[]> {
  const { data, error } = await service.from('messages').select('role,content,chat_images(*)').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(8);
  if (error) throw new Error('IMAGE_STORAGE_FAILED');
  const rows = (data || []).flatMap((message: any) => (message.chat_images || []).map((image: any) => ({ ...image, label: `Imagen anterior (${message.role}): ${message.content.slice(0, 240)}` }))).filter((row: any) => !currentIds.includes(row.id)).slice(0, 2);
  return Promise.all(rows.reverse().map(async (row: any) => ({ ...await readChatImage(service, row), label: row.label })));
}
export async function cleanupPendingImages(service: Service) {
  const { data } = await service.from('chat_images').select('id,object_path').is('message_id', null).lt('created_at', new Date(Date.now() - 86400000).toISOString()).limit(20);
  if (!data?.length) return;
  const { error } = await service.storage.from(BUCKET).remove(data.map(row => row.object_path));
  if (!error) await service.from('chat_images').delete().in('id', data.map(row => row.id)).is('message_id', null);
}
