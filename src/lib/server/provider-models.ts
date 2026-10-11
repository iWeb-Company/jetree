import type { ApiProvider } from './provider-health';

export type ProviderModel = { value: string; label: string };

export async function listProviderModels(provider: ApiProvider, key: string, fetcher: typeof fetch = fetch): Promise<ProviderModel[]> {
  const headers: Record<string, string> = {};
  let url: string;
  if (provider === 'groq') { url = 'https://api.groq.com/openai/v1/models'; headers.Authorization = `Bearer ${key}`; }
  else if (provider === 'gemini') { url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'; headers['x-goog-api-key'] = key; }
  else if (provider === 'claude') { url = 'https://api.anthropic.com/v1/models?limit=1000'; headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
  else { url = provider === 'custom' ? 'https://openrouter.ai/api/v1/models' : provider === 'deepseek' ? 'https://api.deepseek.com/models' : 'https://api.openai.com/v1/models'; headers.Authorization = `Bearer ${key}`; }
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('PROVIDER_MODELS_UNAVAILABLE');
  const data = await response.json();
  const rows = provider === 'gemini' ? data.models : data.data;
  if (!Array.isArray(rows)) throw new Error('PROVIDER_MODELS_UNAVAILABLE');
  return rows.filter(row => provider !== 'gemini' || row.supportedGenerationMethods?.includes('generateContent'))
    .flatMap(row => {
      const value = provider === 'gemini' ? row.name?.replace(/^models\//, '') : row.id;
      if (typeof value !== 'string' || !value || value.length > 200) return [];
      return [{ value, label: String(row.displayName || row.display_name || row.name || value).slice(0, 200) }];
    }).slice(0, 1000);
}
