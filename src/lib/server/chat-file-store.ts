import { randomUUID } from 'node:crypto';
import { getServiceSupabase } from './auth';
import { renderFile } from './file-renderer';
import type { FileRef } from '@/lib/generated-files';
type Service = ReturnType<typeof getServiceSupabase>;
export function fileRef(row: any): FileRef { return { id: row.id, name: row.name, mimeType: row.mime_type, byteSize: row.byte_size }; }
export async function saveChatFile(service: Service, ownerId: string, agentId: string, executionId: string, input: unknown): Promise<FileRef> {
  const rendered = await renderFile(input); const id = randomUUID(); const path = `${ownerId}/${id}/${rendered.name}`;
  const { error: uploadError } = await service.storage.from('chat-files').upload(path, rendered.bytes, { contentType: rendered.mimeType, upsert: false });
  if (uploadError) throw new Error('FILE_STORAGE_FAILED');
  const { data, error } = await service.from('chat_files').insert({ id, owner_user_id: ownerId, agent_id: agentId, execution_id: executionId, object_path: path, name: rendered.name, mime_type: rendered.mimeType, byte_size: rendered.bytes.length }).select('*').single();
  if (error || !data) { await service.storage.from('chat-files').remove([path]); throw new Error('FILE_STORAGE_FAILED'); }
  return fileRef(data);
}
export async function attachChatFiles(service: Service, ids: string[], messageId: string) {
  if (!ids.length) return;
  const { data, error } = await service.from('chat_files').update({ message_id: messageId }).in('id', ids).is('message_id', null).select('id');
  if (error || data?.length !== ids.length) throw new Error('FILE_STORAGE_FAILED');
}
export async function readChatFile(service: Service, row: any) {
  if (!row.object_path || row.byte_size > 5242880) throw new Error('FILE_ACCESS_DENIED');
  const { data, error } = await service.storage.from('chat-files').download(row.object_path);
  if (error || !data || data.size > 5242880) throw new Error('FILE_STORAGE_FAILED');
  return Buffer.from(await data.arrayBuffer());
}
