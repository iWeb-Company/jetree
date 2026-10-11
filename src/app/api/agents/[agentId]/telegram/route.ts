import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/server/provider-secrets';

const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(request: Request, { params: promisedParams }: { params: Promise<{ agentId: string }> }) {
  const params = await promisedParams;
  try {
    const { client, user } = await requireUser(request);
    const { data: agent } = await client.from('agents').select('id').eq('id', params.agentId).maybeSingle();
    if (!agent) return jsonError('Agente no encontrado o sin permisos.', 404);
    const service = getServiceSupabase();
    const { data, error } = await service.from('telegram_bots').select('bot_username,is_active,updated_at,owner_user_id,tool_chat_id,tool_user_id').eq('agent_id', params.agentId).maybeSingle();
    if (error) return jsonError('No se pudo consultar el bot.', 500);
    return NextResponse.json({ telegramBot: data ? { botUsername: data.bot_username, isActive: data.is_active, updatedAt: data.updated_at, toolChatLinked: Boolean(data.tool_chat_id && data.tool_user_id), canLinkTools: data.owner_user_id === user.id } : null });
  } catch (error) {
    const auth = error instanceof Error && error.message === 'AUTH_REQUIRED';
    return jsonError(auth ? 'Autenticación requerida.' : 'Error interno.', auth ? 401 : 500);
  }
}

export async function POST(request: Request, { params: promisedParams }: { params: Promise<{ agentId: string }> }) {
  const params = await promisedParams;
  try {
    const { client, user } = await requireUser(request);
    const { data: agent } = await client.from('agents').select('id').eq('id', params.agentId).maybeSingle();
    if (!agent) return jsonError('Agente no encontrado o sin permisos.', 404);
    const body = await request.json();
    if (body.action === 'link_tools' || body.action === 'unlink_tools') {
      const service = getServiceSupabase();
      const { data: bot } = await service.from('telegram_bots').select('*').eq('agent_id', params.agentId).eq('owner_user_id', user.id).eq('is_active', true).maybeSingle();
      if (!bot) return jsonError('Solo el propietario puede autorizar el chat de este bot.', 403);
      if (body.action === 'unlink_tools') {
        const { error } = await service.from('telegram_bots').update({ tool_chat_id: null, tool_user_id: null, tool_pair_hash: null, tool_pair_expires_at: null }).eq('id', bot.id).eq('owner_user_id', user.id);
        if (error) return jsonError('No se pudo revocar el chat.', 500);
        return NextResponse.json({ ok: true });
      }
      // Existing bots must subscribe to callbacks too. Rotate the webhook secret
      // without asking the user to expose or re-enter the encrypted bot token.
      const token = decryptProviderSecret({ ciphertext: bot.token_ciphertext, iv: bot.token_iv, auth_tag: bot.token_auth_tag });
      const secret = randomBytes(32).toString('hex');
      const baseUrl = process.env.JETREE_APP_URL || new URL(request.url).origin;
      if (!baseUrl.startsWith('https://')) return jsonError('Configura JETREE_APP_URL con HTTPS.', 503);
      const registration = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ url: `${baseUrl.replace(/\/$/, '')}/api/webhook/telegram/${params.agentId}`, secret_token: secret, allowed_updates: ['message', 'edited_message', 'callback_query'] }),
      });
      const result = await registration.json().catch(() => null);
      if (!registration.ok || !result?.ok) return jsonError('No se pudo habilitar la aprobación en Telegram.', 502);
      const code = randomBytes(24).toString('hex');
      const { error } = await service.from('telegram_bots').update({ secret_hash: createHash('sha256').update(secret).digest('hex'), tool_pair_hash: createHash('sha256').update(code).digest('hex'), tool_pair_expires_at: new Date(Date.now() + 600_000).toISOString() }).eq('id', bot.id).eq('owner_user_id', user.id);
      if (error) return jsonError('No se pudo guardar la autorización del chat.', 500);
      return NextResponse.json({ command: `/vincular ${code}`, expiresInSeconds: 600 });
    }
    const token = typeof body.botToken === 'string' ? body.botToken.trim() : '';
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) return jsonError('Token de Telegram inválido.', 400);
    const telegram = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
    const identity = await telegram.json().catch(() => null);
    if (!telegram.ok || !identity?.ok || !identity.result?.username) return jsonError('Telegram rechazó el token de bot.', 400);

    const baseUrl = process.env.JETREE_APP_URL || new URL(request.url).origin;
    if (!baseUrl.startsWith('https://')) return jsonError('Configura JETREE_APP_URL con una URL HTTPS pública.', 503);
    const secret = randomBytes(32).toString('hex');
    const encrypted = encryptProviderSecret(token);
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/telegram/${params.agentId}`;
    const registration = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ['message','edited_message','callback_query'] }),
    });
    const registrationData = await registration.json().catch(() => null);
    if (!registration.ok || !registrationData?.ok) return jsonError('No se pudo registrar el webhook en Telegram.', 502);

    const service = getServiceSupabase();
    const { error } = await service.from('telegram_bots').upsert({
      agent_id: params.agentId, owner_user_id: user.id, token_ciphertext: encrypted.ciphertext,
      token_iv: encrypted.iv, token_auth_tag: encrypted.auth_tag,
      secret_hash: createHash('sha256').update(secret).digest('hex'),
      tool_chat_id: null, tool_user_id: null, tool_pair_hash: null, tool_pair_expires_at: null,
      bot_username: identity.result.username, is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'agent_id' });
    if (error) return jsonError('Webhook registrado, pero no se pudo guardar la conexión.', 500);
    return NextResponse.json({ telegramBot: { botUsername: identity.result.username, isActive: true, webhookUrl } });
  } catch (error) {
    const auth = error instanceof Error && error.message === 'AUTH_REQUIRED';
    return jsonError(auth ? 'Autenticación requerida.' : 'Error interno.', auth ? 401 : 500);
  }
}

export async function DELETE(request: Request, { params: promisedParams }: { params: Promise<{ agentId: string }> }) {
  const params = await promisedParams;
  try {
    const { client } = await requireUser(request);
    const { data: agent } = await client.from('agents').select('id').eq('id', params.agentId).maybeSingle();
    if (!agent) return jsonError('Agente no encontrado o sin permisos.', 404);
    const service = getServiceSupabase();
    const { data: bot } = await service.from('telegram_bots').select('token_ciphertext,token_iv,token_auth_tag').eq('agent_id', params.agentId).maybeSingle();
    if (bot) {
      const { decryptProviderSecret } = await import('@/lib/server/provider-secrets');
      const token = decryptProviderSecret({ ciphertext: bot.token_ciphertext, iv: bot.token_iv, auth_tag: bot.token_auth_tag });
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' }).catch(() => undefined);
    }
    const { error } = await service.from('telegram_bots').delete().eq('agent_id', params.agentId);
    if (error) return jsonError('No se pudo desconectar el bot.', 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = error instanceof Error && error.message === 'AUTH_REQUIRED';
    return jsonError(auth ? 'Autenticación requerida.' : 'Error interno.', auth ? 401 : 500);
  }
}
