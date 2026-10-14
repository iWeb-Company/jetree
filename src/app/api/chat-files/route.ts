import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { readChatFile } from '@/lib/server/chat-file-store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const { data, error } = await client.from('chat_files').select('*').eq('id', new URL(request.url).searchParams.get('id') || '').maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 404 });
    const bytes = await readChatFile(getServiceSupabase(), data);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': data.mime_type, 'Content-Disposition': `attachment; filename="jetree-file"; filename*=UTF-8''${encodeURIComponent(data.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
  } catch (error) { return NextResponse.json({ error: 'No se pudo descargar el archivo.' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 500 }); }
}
