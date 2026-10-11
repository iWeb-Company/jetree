import type { AIProvider } from '@/types';

export const API_PROVIDERS = ['gemini', 'claude', 'openai', 'custom', 'deepseek', 'groq'] as const;
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI',
  custom: 'OpenRouter', deepseek: 'DeepSeek', groq: 'Groq',
};
export function isApiProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && API_PROVIDERS.includes(value as AIProvider);
}
export interface ApiConnection {
  id: string;
  provider: AIProvider;
  status: string;
  connection_type: string;
  connected_at?: string;
  metadata?: { label?: string; is_default?: boolean };
}
export function connectionLabel(connection: ApiConnection): string {
  return connection.metadata?.label || `${PROVIDER_LABELS[connection.provider]} · ${connection.id.slice(0, 8)}`;
}
