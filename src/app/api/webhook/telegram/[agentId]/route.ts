import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/server/auth';
import { extractTelegramTextUpdate, verifyTelegramSecret } from '@/lib/telegram-webhook';

export const runtime = 'nodejs';

export async function POST(request: Request, { params: promisedParams }: { params: Promise<{ agentId: string }> }) {
  const params = await promisedParams;
  const service = getServiceSupabase();
  const { data: bot, error } = await service.from('telegram_bots').select('id,secret_hash').eq('agent_id', params.agentId).eq('is_active', true).maybeSingle();
  if (error) return NextResponse.json({ error: 'Webhook unavailable.' }, { status: 503 });
  if (!bot) return NextResponse.json({ error: 'Webhook not configured.' }, { status: 404 });
  const supplied = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!verifyTelegramSecret(bot.secret_hash, supplied)) {
    return NextResponse.json({ error: 'Unauthorized webhook.' }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 64_000) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 64_000) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    body = JSON.parse(rawBody);
  } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const parsed = extractTelegramTextUpdate(body);
  if (!parsed) return NextResponse.json({ ok: true, ignored: true });
  const { error: insertError } = await service.from('telegram_updates').upsert({
    bot_id: bot.id, agent_id: params.agentId, update_id: parsed.updateId, chat_id: parsed.chatId,
    sender_name: parsed.senderName, message_text: parsed.text, status: 'pending',
  }, { onConflict: 'bot_id,update_id', ignoreDuplicates: true });
  if (insertError) return NextResponse.json({ error: 'Could not enqueue update.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
