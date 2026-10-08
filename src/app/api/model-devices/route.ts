import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { newDeviceToken, hashDeviceToken } from '@/lib/server/model-devices';
import { deviceIsOnline } from '@/lib/model-device-contract';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  return NextResponse.json({ error: 'No se pudo administrar la conexión personal.' }, {
    status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 503, headers,
  });
}

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const { data, error } = await getServiceSupabase().from('model_devices')
      .select('id,name,provider,last_seen_at,revoked_at').eq('user_id', user.id).is('revoked_at', null);
    if (error) throw error;
    return NextResponse.json({ devices: (data || []).map(item => ({
      id: item.id, name: item.name, provider: item.provider,
      online: deviceIsOnline(item.last_seen_at, item.revoked_at),
    })) }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const service = getServiceSupabase();
    const { error: cleanupError } = await service.from('model_device_pairs').delete().eq('user_id', user.id);
    if (cleanupError) throw cleanupError;
    const token = newDeviceToken();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error } = await service.from('model_device_pairs').insert({
      user_id: user.id, token_hash: hashDeviceToken(token), expires_at: expiresAt,
    });
    if (error) throw error;
    return NextResponse.json({ pairingCode: token, expiresAt }, { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: 'Conexión inválida.' }, { status: 400, headers });
    const { data, error } = await getServiceSupabase().rpc('revoke_model_device', { owner_id: user.id, device_id: id });
    if (error) throw error;
    return NextResponse.json({ revoked: Boolean(data) }, { status: data ? 200 : 404, headers });
  } catch (error) { return failure(error); }
}
