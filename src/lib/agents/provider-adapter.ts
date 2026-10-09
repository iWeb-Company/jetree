import { Agent } from '@/types';
import { analyzeWithChatGPT, analyzeWithOpenRouter, analyzeWithDeepSeek } from '@/lib/openai';
import { analyzeWithGemini } from '@/lib/gemini';
import { analyzeWithClaude } from '@/lib/claude';

export class AgentEngineError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = 'AgentEngineError';
  }
}

export type ProviderCall = (agent: Agent, prompt: string, apiKeys: Record<string, string>) => Promise<string>;

function safeProviderError(error: unknown): AgentEngineError {
  const candidate = error as { status?: number; code?: string; name?: string; message?: string };
  const status = Number(candidate?.status || 0);
  const detail = `${candidate?.code || ''} ${candidate?.name || ''} ${candidate?.message || ''}`.toLowerCase();
  if (status === 401 || status === 403 || /invalid[_ -]?api[_ -]?key|api key not valid|authentication/.test(detail)) {
    return new AgentEngineError('PROVIDER_AUTH_FAILED');
  }
  if (status === 429 || /rate[_ -]?limit|quota/.test(detail)) return new AgentEngineError('PROVIDER_RATE_LIMITED');
  if (/timeout|timed out|aborterror/.test(detail) || candidate?.name === 'AbortError') {
    return new AgentEngineError('PROVIDER_TIMEOUT');
  }
  if (status >= 500) return new AgentEngineError('PROVIDER_UNAVAILABLE');
  return new AgentEngineError('PROVIDER_EXECUTION_FAILED');
}

export async function callAIProvider(agent: Agent, prompt: string, apiKeys: Record<string, string>): Promise<string> {
  if (prompt.length > 24_000) throw new AgentEngineError('AGENT_CONTEXT_TOO_LARGE');
  if (!apiKeys[agent.provider]) throw new AgentEngineError('PROVIDER_CREDENTIAL_REQUIRED');
  try {
    if (agent.provider === 'claude') return (await analyzeWithClaude(prompt, apiKeys.claude, agent.model)) || '';
    if (agent.provider === 'openai') return (await analyzeWithChatGPT(prompt, apiKeys.openai, agent.model)) || '';
    if (agent.provider === 'gemini') return (await analyzeWithGemini(prompt, apiKeys.gemini, agent.model)) || '';
    if (agent.provider === 'custom') return (await analyzeWithOpenRouter(prompt, apiKeys.custom, agent.model)) || '';
    if (agent.provider === 'deepseek') return (await analyzeWithDeepSeek(prompt, apiKeys.deepseek, agent.model)) || '';
    throw new AgentEngineError('UNSUPPORTED_PROVIDER');
  } catch (error) {
    if (error instanceof AgentEngineError) throw error;
    throw safeProviderError(error);
  }
}

export function providerErrorMessage(code: string): string {
  switch (code) {
    case 'MODEL_DEVICE_OFFLINE': return 'Tu conector personal está desconectado o fue revocado. Encendelo y volvé a intentar. No se usó la API.';
    case 'MODEL_DEVICE_UNAVAILABLE': return 'La conexión personal no pudo completar la respuesta. Revisá el conector; no se cambió a la API.';
    case 'MODEL_DEVICE_PROVIDER_UNSUPPORTED': return 'Este proveedor todavía no está habilitado en el conector personal.';
    case 'PROVIDER_AUTH_FAILED': return 'El proveedor rechazó la credencial. Revisá la conexión API.';
    case 'PROVIDER_RATE_LIMITED': return 'El proveedor alcanzó un límite de uso o cuota. Revisá la cuenta e intentá más tarde.';
    case 'PROVIDER_TIMEOUT': return 'El proveedor tardó demasiado en responder. La ejecución quedó como fallida.';
    case 'PROVIDER_UNAVAILABLE': return 'El proveedor está temporalmente no disponible.';
    case 'PROVIDER_CREDENTIAL_REQUIRED': return 'Falta una conexión API propia para el proveedor del agente.';
    case 'AGENT_CONTEXT_TOO_LARGE': return 'El contexto del agente supera el límite de esta ejecución.';
    case 'MANAGER_DECISION_INVALID': return 'El manager devolvió un plan inválido y no se ejecutó ninguna delegación.';
    case 'DELEGATION_TARGET_NOT_ALLOWED': return 'El manager seleccionó un agente fuera de sus subordinados permitidos. No se delegó la tarea.';
    case 'PERSISTENCE_FAILED': return 'La ejecución no pudo guardarse correctamente. Revisá el historial antes de volver a intentarlo.';
    default: return 'El proveedor no pudo completar la ejecución.';
  }
}
