import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { newDeviceToken, hashDeviceToken } from '@/lib/server/model-devices';
import { validDeviceToken } from '@/lib/model-device-contract';
import { readBoundedJson } from '@/lib/server/bounded-json';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 2048) return new NextResponse(null, { status: 413 });
    const body = await readBoundedJson(request, 2048);
    if (!validDeviceToken(body.pairingCode) || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) {
      return NextResponse.json({ error: 'Vinculación inválida.' }, { status: 400 });
    }
    const token = newDeviceToken();
    const { data, error } = await getServiceSupabase().rpc('pair_model_device', {
      pair_hash: hashDeviceToken(body.pairingCode), device_hash: hashDeviceToken(token), device_name: body.name.trim(),
    });
    if (error || !data) return NextResponse.json({ error: 'Código vencido, usado o límite de equipos alcanzado.' }, { status: 409 });
    return NextResponse.json({ deviceId: data, token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: 'No se pudo vincular el equipo.' }, { status: code === 'BODY_TOO_LARGE' ? 413 : code === 'BODY_INVALID' || error instanceof SyntaxError ? 400 : 503 });
  }
}
