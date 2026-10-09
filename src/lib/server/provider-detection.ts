import { validateProviderApiKey, type ApiProvider, type ProviderHealthCode } from './provider-health';

export type DetectionResult = { ok: true; provider: ApiProvider } | { ok: false; code: ProviderHealthCode | 'unsupported_key' | 'ambiguous_provider' };

// Recognizable keys are sent only to their issuer. Legacy sk- keys overlap:
// validate them at the two official read-only endpoints, never by inference.
export function keyCandidates(key: string): ApiProvider[] {
  if (/^(?:AIza[\w-]+|AQ\.[\w.-]+)$/.test(key)) return ['gemini'];
  if (/^sk-ant-api[\w-]+$/.test(key)) return ['claude'];
  if (/^sk-or-v1-[\w-]+$/.test(key)) return ['custom'];
  if (/^sk-(proj|svcacct)-[\w-]+$/.test(key)) return ['openai'];
  if (key.startsWith('sk-ant-') || key.startsWith('sk-or-')) return [];
  if (/^sk-[a-zA-Z0-9_-]+$/.test(key)) return ['openai', 'deepseek'];
  return [];
}

export async function detectProviderApiKey(key: string, fetcher: typeof fetch = fetch): Promise<DetectionResult> {
  const candidates = keyCandidates(key);
  if (!candidates.length) return { ok: false, code: 'unsupported_key' };
  const checks = await Promise.all(candidates.map(async provider => ({ provider, health: await validateProviderApiKey(provider, key, fetcher) })));
  const accepted = checks.filter(check => check.health.ok);
  if (accepted.length > 1) return { ok: false, code: 'ambiguous_provider' };
  if (accepted.length === 1) return { ok: true, provider: accepted[0].provider };
  const temporary = checks.find(check => !check.health.ok && check.health.code !== 'invalid_credentials');
  return { ok: false, code: temporary && !temporary.health.ok ? temporary.health.code : 'invalid_credentials' };
}
