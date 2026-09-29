export type ApiProvider = 'openai' | 'gemini' | 'claude' | 'custom';
export type ProviderHealthCode = 'invalid_credentials' | 'rate_limited' | 'provider_unavailable' | 'network_error' | 'unknown';

export type ProviderHealth = { ok: true } | { ok: false; code: ProviderHealthCode };

function endpointFor(provider: ApiProvider): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: {} };
    case 'gemini':
      return { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: {} };
    case 'claude':
      return { url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'anthropic-version': '2023-06-01' } };
    case 'custom':
      return { url: 'https://openrouter.ai/api/v1/key', headers: { 'X-Title': 'Jetree' } };
  }
}

function codeForStatus(status: number): ProviderHealthCode {
  if (status === 401 || status === 403) return 'invalid_credentials';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'unknown';
}

export async function validateProviderApiKey(
  provider: ApiProvider,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ProviderHealth> {
  const endpoint = endpointFor(provider);
  const headers = { ...endpoint.headers };
  if (provider === 'openai' || provider === 'custom') headers.Authorization = `Bearer ${apiKey}`;
  if (provider === 'gemini') headers['x-goog-api-key'] = apiKey;
  if (provider === 'claude') headers['x-api-key'] = apiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(endpoint.url, { method: 'GET', headers, signal: controller.signal, cache: 'no-store', redirect: 'error' });
    return response.ok ? { ok: true } : { ok: false, code: codeForStatus(response.status) };
  } catch {
    return { ok: false, code: 'network_error' };
  } finally {
    clearTimeout(timeout);
  }
}

export function providerHealthMessage(code: ProviderHealthCode): string {
  switch (code) {
    case 'invalid_credentials': return 'El proveedor rechazó la credencial. Revisá la clave y sus permisos.';
    case 'rate_limited': return 'El proveedor limitó la validación. Esperá un momento e intentá de nuevo.';
    case 'provider_unavailable': return 'El proveedor no está disponible ahora. Intentá de nuevo más tarde.';
    case 'network_error': return 'No se pudo contactar al proveedor. Intentá de nuevo más tarde.';
    default: return 'El proveedor no pudo validar esta credencial.';
  }
}
