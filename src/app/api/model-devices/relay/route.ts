import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { deviceAuthorization, hashDeviceToken, newDeviceToken } from '@/lib/server/model-devices';
import { validDeviceToken } from '@/lib/model-device-contract';
import { readBoundedJson } from '@/lib/server/bounded-json';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const hash = deviceAuthorization(request);
    if (Number(request.headers.get('content-length')) > 200_000) return new NextResponse(null, { status: 413 });
    const body = await readBoundedJson(request, 200_000);
    if (!['poll', 'heartbeat', 'complete', 'fail'].includes(body.action)) return new NextResponse(null, { status: 400 });
    const poll = body.action === 'poll';
    const lease = poll ? newDeviceToken() : body.lease;
    if (!validDeviceToken(lease) || (!poll && (!/^[a-f0-9-]{36}$/.test(body.jobId || '') ||
      (body.action === 'complete' && (typeof body.response !== 'string' || !body.response.trim() || body.response.length > 48_000))))) {
      return new NextResponse(null, { status: 400 });
    }
    const { data, error } = await getServiceSupabase().rpc('model_device_transition', {
      device_hash: hash, action: body.action, job_id: poll ? null : body.jobId,
      lease_hash: hashDeviceToken(lease), result_text: body.action === 'complete' ? body.response : null,
    });
    if (error) return NextResponse.json({ error: 'Conexión o trabajo revocado, vencido o inválido.' }, { status: 409 });
    return NextResponse.json(poll ? { job: data ? { ...data, lease } : null } : data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return new NextResponse(null, { status: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 401 }); }
}
