import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { getUserProviderApiKey } from '@/lib/server/provider-secrets';
import { listProviderModels } from '@/lib/server/provider-models';
import type { ApiProvider } from '@/lib/server/provider-health';

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const provider = new URL(request.url).searchParams.get('provider');
    if (!provider || !['openai', 'claude', 'gemini', 'custom', 'deepseek', 'groq'].includes(provider)) return NextResponse.json({ error: 'Proveedor inválido.' }, { status: 400 });
    const connectionId = new URL(request.url).searchParams.get('connectionId') || undefined;
    if (connectionId && !/^[a-f0-9-]{36}$/i.test(connectionId)) return NextResponse.json({ error: 'Conexión inválida.' }, { status: 400 });
    const key = await getUserProviderApiKey(user.id, provider as ApiProvider, connectionId);
    if (!key) return NextResponse.json({ error: 'Conectá este proveedor para consultar su catálogo.' }, { status: 409 });
    return NextResponse.json({ models: await listProviderModels(provider as ApiProvider, key), source: 'provider', connectionType: 'api_key', note: 'El catálogo no garantiza cuota o permiso de ejecución para todos los modelos.' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const auth = error instanceof Error && error.message === 'AUTH_REQUIRED';
    return NextResponse.json({ error: auth ? 'Autenticación requerida.' : 'No se pudo consultar el catálogo del proveedor.' }, { status: auth ? 401 : 502 });
  }
}
