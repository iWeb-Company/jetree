import { NextResponse } from 'next/server';

// Global unauthenticated webhooks were retired when Telegram bots became
// individually configured. Use /api/webhook/telegram/[agentId] instead.
export async function POST() {
  return NextResponse.json({ error: 'Configure a bot-specific webhook.' }, { status: 410 });
}
