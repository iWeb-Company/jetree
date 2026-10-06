import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Liveness only; external integrations are verified separately.
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
