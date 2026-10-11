import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { cleanupPendingImages, readChatImage, saveChatImage } from '@/lib/server/chat-image-store';
import { imageErrorMessage, MAX_IMAGE_UPLOAD_BYTES } from '@/lib/chat-images';

export const runtime = 'nodejs';
async function boundedUpload(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_IMAGE_UPLOAD_BYTES || !request.body) throw new Error('IMAGE_TOO_LARGE');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > MAX_IMAGE_UPLOAD_BYTES) { await reader.cancel(); throw new Error('IMAGE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : imageErrorMessage(code), code: code.startsWith('IMAGE_') ? code : undefined }, { status: code === 'AUTH_REQUIRED' ? 401 : code === 'IMAGE_TOO_LARGE' ? 413 : code === 'IMAGE_FORMAT_INVALID' ? 400 : code === 'IMAGE_ACCESS_DENIED' ? 404 : 500 });
}
export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const agentId = new URL(request.url).searchParams.get('agentId');
    const { data: agent, error } = await client.from('agents').select('id,department_id').eq('id', agentId || '').is('deleted_at', null).maybeSingle();
    if (error || !agent) throw new Error('IMAGE_ACCESS_DENIED');
    const { data: department } = await client.from('departments').select('id').eq('id', agent.department_id).is('deleted_at', null).maybeSingle();
    if (!department) throw new Error('IMAGE_ACCESS_DENIED');
    const bytes = await boundedUpload(request); const service = getServiceSupabase();
    await cleanupPendingImages(service).catch(() => {});
    const { count, error: countError } = await service.from('chat_images').select('id', { count: 'exact', head: true }).eq('owner_user_id', user.id).is('message_id', null);
    if (countError) throw new Error('IMAGE_STORAGE_FAILED');
    if ((count || 0) >= 20) return NextResponse.json({ error: 'Hay demasiadas imágenes sin enviar. Esperá a que expiren o usá las que ya adjuntaste.' }, { status: 429 });
    return NextResponse.json({ image: await saveChatImage(service, user.id, agent.id, bytes, 'received') }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    const { data, error } = await client.from('chat_images').select('*').eq('id', id || '').maybeSingle();
    if (error || !data) throw new Error('IMAGE_ACCESS_DENIED');
    const image = await readChatImage(getServiceSupabase(), data);
    return new Response(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="jetree-${data.id}.png"` } });
  } catch (error) { return failure(error); }
}
