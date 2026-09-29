import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/server/provider-secrets';
import { providerHealthMessage, validateProviderApiKey } from '@/lib/server/provider-health';

export const runtime = 'nodejs';

const providers = ['openai', 'gemini', 'claude', 'custom'] as const;
type Provider = (typeof providers)[number];

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && providers.includes(value as Provider);
}

function responseForError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 });
  if (code === 'SERVER_CONFIGURATION_ERROR') {
    return NextResponse.json({ error: 'La bóveda de credenciales no está configurada en el servidor.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'No se pudo procesar la conexión del proveedor.' }, { status: 500 });
}

async function audit(
  userId: string,
  provider: Provider,
  action: 'validated' | 'validation_failed' | 'revoked' | 'saved',
  resultCode: string | null = null,
) {
  const service = getServiceSupabase();
  await service.from('provider_connection_audit').insert({ user_id: userId, provider, action, result_code: resultCode });
}

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const { data, error } = await client
      .from('provider_connections')
      .select('id, provider, status, connection_type, connected_at, updated_at, last_checked_at, last_error_code')
      .eq('user_id', user.id)
      .order('provider');

    if (error) return NextResponse.json({ error: 'No se pudieron cargar las conexiones.' }, { status: 500 });
    return NextResponse.json({ connections: data || [] });
  } catch (error) {
    return responseForError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const body = await request.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    const hasNewKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 0;
    const apiKey = hasNewKey ? body.apiKey.trim() : '';

    if (!isProvider(body.provider) || (hasNewKey && (apiKey.length < 8 || apiKey.length > 4096))) {
      return NextResponse.json({ error: 'Proveedor o clave API inválidos.' }, { status: 400 });
    }

    const service = getServiceSupabase();
    let keyToValidate = apiKey;
    let existingConnectionId: string | null = null;
    if (!hasNewKey) {
      const { data: connection, error: connectionError } = await service
        .from('provider_connections').select('id, connection_type')
        .eq('user_id', user.id).eq('provider', body.provider).maybeSingle();
      if (connectionError) return NextResponse.json({ error: 'No se pudo cargar la conexión.' }, { status: 500 });
      if (!connection || connection.connection_type !== 'api_key') {
        return NextResponse.json({ error: 'No hay una clave API para validar.' }, { status: 404 });
      }
      existingConnectionId = connection.id;
      const { data: secret, error: secretError } = await service.from('provider_connection_secrets')
        .select('ciphertext, iv, auth_tag').eq('connection_id', connection.id).maybeSingle();
      if (secretError) return NextResponse.json({ error: 'No se pudo cargar la credencial.' }, { status: 500 });
      if (!secret) return NextResponse.json({ error: 'No hay una clave API para validar.' }, { status: 404 });
      keyToValidate = decryptProviderSecret(secret);
    }

    const health = await validateProviderApiKey(body.provider, keyToValidate);
    const checkedAt = new Date().toISOString();
    if (!health.ok) {
      if (existingConnectionId) {
        await service.from('provider_connections').update({
          status: health.code === 'invalid_credentials' ? 'expired' : 'error',
          last_checked_at: checkedAt,
          last_error_code: health.code,
          updated_at: checkedAt,
        }).eq('id', existingConnectionId).eq('user_id', user.id);
      }
      await audit(user.id, body.provider, 'validation_failed', health.code);
      return NextResponse.json({ error: providerHealthMessage(health.code), code: health.code }, { status: 422 });
    }

    if (hasNewKey) {
      const encrypted = encryptProviderSecret(apiKey);
      const { data: connection, error: connectionError } = await service
        .from('provider_connections')
        .upsert({
          user_id: user.id,
          provider: body.provider,
          connection_type: 'api_key',
          status: 'connected',
          metadata: {},
          connected_at: new Date().toISOString(),
          last_checked_at: checkedAt,
          last_error_code: null,
          updated_at: checkedAt,
        }, { onConflict: 'user_id,provider' })
        .select('id, provider, status, connection_type, connected_at, updated_at, last_checked_at, last_error_code')
        .single();

      if (connectionError || !connection) {
        return NextResponse.json({ error: 'No se pudo guardar la conexión.' }, { status: 500 });
      }

      const { error: secretError } = await service
        .from('provider_connection_secrets')
        .upsert({ connection_id: connection.id, ...encrypted, updated_at: new Date().toISOString() }, { onConflict: 'connection_id' });

      if (secretError) {
        await service.from('provider_connections').update({ status: 'error' }).eq('id', connection.id).eq('user_id', user.id);
        return NextResponse.json({ error: 'No se pudo guardar la credencial cifrada.' }, { status: 500 });
      }

      await audit(user.id, body.provider, 'saved');
      return NextResponse.json({ connection }, { status: 200 });
    }

    const { data: connection, error: updateError } = await service.from('provider_connections').update({
      status: 'connected', last_checked_at: checkedAt, last_error_code: null, updated_at: checkedAt,
    }).eq('id', existingConnectionId).eq('user_id', user.id)
      .select('id, provider, status, connection_type, connected_at, updated_at, last_checked_at, last_error_code').single();
    if (updateError || !connection) return NextResponse.json({ error: 'No se pudo actualizar la conexión.' }, { status: 500 });
    await audit(user.id, body.provider, 'validated');
    return NextResponse.json({ connection }, { status: 200 });
  } catch (error) {
    return responseForError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser(request);
    const provider = new URL(request.url).searchParams.get('provider');
    if (!isProvider(provider)) return NextResponse.json({ error: 'Proveedor inválido.' }, { status: 400 });

    const service = getServiceSupabase();
    const { data: connection } = await service.from('provider_connections').select('id')
      .eq('user_id', user.id).eq('provider', provider).maybeSingle();
    const { error } = await service
      .from('provider_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    if (error) return NextResponse.json({ error: 'No se pudo revocar la conexión.' }, { status: 500 });
    if (connection) await audit(user.id, provider, 'revoked');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseForError(error);
  }
}
