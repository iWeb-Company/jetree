import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runTelegramQueue } from '@/lib/server/telegram-queue';

export const runtime = 'nodejs';
export const maxDuration = 240;
export async function POST(request: Request) {
  const expected = Buffer.from(process.env.JETREE_TELEGRAM_WORKER_SECRET || '');
  const supplied = Buffer.from(request.headers.get('x-jetree-worker-secret') || '');
  if (expected.length < 32 || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try { return NextResponse.json({ processed: await runTelegramQueue() }); }
  catch { return NextResponse.json({ error: 'Queue unavailable.' }, { status: 503 }); }
}
