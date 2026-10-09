import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/server/provider-secrets';
import { providerHealthMessage, validateProviderApiKey } from '@/lib/server/provider-health';
import { detectProviderApiKey } from '@/lib/server/provider-detection';
import { readBoundedJson } from '@/lib/server/bounded-json';

export const runtime = 'nodejs';
const columns = 'id,provider,status,connection_type,connected_at,updated_at,last_checked_at,last_error_code,metadata';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status = code === 'AUTH_REQUIRED' ? 401 : code === 'BODY_TOO_LARGE' ? 413 : code === 'BODY_INVALID' || error instanceof SyntaxError ? 400 : code === 'SERVER_CONFIGURATION_ERROR' ? 503 : 500;
  return NextResponse.json({ error: status === 401 ? 'Autenticación requerida.' : status === 400 || status === 413 ? 'Solicitud inválida.' : 'No se pudo procesar la conexión.' }, { status });
}

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const { data, error } = await client.from('provider_connections').select(columns).eq('user_id', user.id).eq('connection_type', 'api_key').order('connected_at');
    if (error) throw new Error('LOOKUP_FAILED');
    return NextResponse.json({ connections: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const body = await readBoundedJson(request, 8192);
    const service = getServiceSupabase();
    if (body.action === 'select' || body.action === 'validate') {
      if (!uuid.test(body.connectionId || '')) return NextResponse.json({ error: 'Conexión inválida.' }, { status: 400 });
      const { data: connection, error } = await service.from('provider_connections').select(columns).eq('id', body.connectionId).eq('user_id', user.id).eq('connection_type', 'api_key').maybeSingle();
      if (error) throw new Error('LOOKUP_FAILED');
      if (!connection) return NextResponse.json({ error: 'Conexión no encontrada.' }, { status: 404 });
      if (body.action === 'select') {
        if (connection.status !== 'connected') return NextResponse.json({ error: 'Validá esta clave antes de usarla.' }, { status: 409 });
        const { error: selectionError } = await service.rpc('select_provider_api_connection', { owner_id: user.id, selected_id: connection.id });
        if (selectionError) throw new Error('SELECT_FAILED');
        return NextResponse.json({ ok: true });
      }
      const { data: secret, error: secretError } = await service.from('provider_connection_secrets').select('ciphertext,iv,auth_tag').eq('connection_id', connection.id).maybeSingle();
      if (secretError || !secret) throw new Error('SECRET_NOT_FOUND');
      const health = await validateProviderApiKey(connection.provider, decryptProviderSecret(secret));
      const checkedAt = new Date().toISOString();
      const { error: updateError } = await service.from('provider_connections').update({ status: health.ok ? 'connected' : health.code === 'invalid_credentials' ? 'expired' : 'error', last_checked_at: checkedAt, last_error_code: health.ok ? null : health.code, updated_at: checkedAt }).eq('id', connection.id).eq('user_id', user.id);
      if (updateError) throw new Error('UPDATE_FAILED');
      await service.from('provider_connection_audit').insert({ user_id: user.id, provider: connection.provider, action: health.ok ? 'validated' : 'validation_failed', result_code: health.ok ? null : health.code });
      return health.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: providerHealthMessage(health.code) }, { status: 422 });
    }
    const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (body.action !== undefined || key.length < 8 || key.length > 4096 || /\s/.test(key)) return NextResponse.json({ error: 'Ingresá una clave API válida.' }, { status: 400 });
    const detection = await detectProviderApiKey(key);
    if (!detection.ok) {
      const message = detection.code === 'unsupported_key' ? 'No se reconoce el formato. Usá una clave API de Google, Anthropic, OpenAI, OpenRouter o DeepSeek.'
        : detection.code === 'ambiguous_provider' ? 'No se pudo identificar un único proveedor para esta clave.' : providerHealthMessage(detection.code);
      return NextResponse.json({ error: message, code: detection.code }, { status: 422 });
    }
    const encrypted = encryptProviderSecret(key);
    const { data: id, error } = await service.rpc('save_provider_api_connection', { owner_id: user.id, detected_provider: detection.provider, encrypted_value: encrypted.ciphertext, encrypted_iv: encrypted.iv, encrypted_tag: encrypted.auth_tag });
    if (error || typeof id !== 'string') throw new Error('SAVE_FAILED');
    const { data: connection, error: readError } = await service.from('provider_connections').select(columns).eq('id', id).eq('user_id', user.id).single();
    if (readError) throw new Error('LOOKUP_FAILED');
    return NextResponse.json({ connection });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!uuid.test(id || '')) return NextResponse.json({ error: 'Conexión inválida.' }, { status: 400 });
    const service = getServiceSupabase();
    const { data: removed, error } = await service.from('provider_connections').delete().eq('user_id', user.id).eq('id', id).select('provider');
    if (error) throw new Error('DELETE_FAILED');
    if (removed?.[0]) await service.from('provider_connection_audit').insert({ user_id: user.id, provider: removed[0].provider, action: 'revoked' });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
