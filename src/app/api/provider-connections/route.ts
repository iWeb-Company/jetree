import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { encryptProviderSecret } from '@/lib/server/provider-secrets';

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

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const { data, error } = await client
      .from('provider_connections')
      .select('id, provider, status, connection_type, connected_at, updated_at')
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
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

    if (!isProvider(body.provider) || apiKey.length < 8 || apiKey.length > 4096) {
      return NextResponse.json({ error: 'Proveedor o clave API inválidos.' }, { status: 400 });
    }

    const encrypted = encryptProviderSecret(apiKey);
    const service = getServiceSupabase();
    const { data: connection, error: connectionError } = await service
      .from('provider_connections')
      .upsert({
        user_id: user.id,
        provider: body.provider,
        connection_type: 'api_key',
        status: 'configured',
        metadata: {},
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' })
      .select('id, provider, status, connection_type, connected_at, updated_at')
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
    const { error } = await service
      .from('provider_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    if (error) return NextResponse.json({ error: 'No se pudo revocar la conexión.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseForError(error);
  }
}
