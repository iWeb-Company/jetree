import type { Agent, AIProvider } from '@/types';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 768 * 1024;
export const IMAGE_PROVIDERS: AIProvider[] = ['gemini', 'openai', 'custom', 'claude', 'groq', 'deepseek'];
export const IMAGE_MODELS = {
  vision: { gemini: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], openai: ['gpt-4o', 'gpt-4o-mini'], claude: ['claude-sonnet-5-5', 'claude-haiku-5-5'], groq: ['qwen/qwen3.8-27b'], custom: ['google/gemini-3.8-flash', 'openai/gpt-4o'], deepseek: [] },
  generation: { gemini: ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image'], openai: ['gpt-image-2.5-sunburst', 'gpt-image-1.5'], custom: ['google/gemini-3.1-flash-image', 'openai/gpt-image-1'], claude: [], groq: [], deepseek: [] },
};

export type ImageRef = { id: string; kind: 'received' | 'generated'; mimeType: string };
export type ImageInput = { bytes: Buffer; mimeType: string; label?: string };
export type ImageRequest = { generate: boolean; prompt: string };

// Explicit command always wins; a question about images never buys a generation.
export function imageRequest(text: string, explicit = false): ImageRequest {
  text = text.replace(/^\[Transcripción de audio\]\s*/i, '');
  const command = /^\/imagen(?:@\w+)?(?:\s|$)/i.test(text);
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  const generate = explicit || command || /^(?:(?:por favor|podes|puedes|podrias|quiero que|necesito que)\s+)*(?:genera(?:me|r)?|crea(?:me|r)?|dibuja(?:me|r)?|hace(?:me|r)?|haz(?:me)?|disena(?:me|r)?)\b[^\n?!]{0,90}\b(?:imagen|foto|ilustracion|dibujo|logo|poster|afiche|banner|retrato|infografia)\b/i.test(normalized) || /^(?:quiero|necesito|me gustaria)\s+(?:una?|que generes una?)\s+(?:imagen|foto|ilustracion|dibujo|logo|poster|afiche|banner|retrato|infografia)\b/i.test(normalized);
  return { generate, prompt: command ? text.replace(/^\/imagen(?:@\w+)?\s*/i, '').trim() : text.trim() };
}

export function imageAdvice(mode: 'vision' | 'generation', provider: AIProvider): string {
  const local = IMAGE_MODELS[mode][provider];
  const picks = local.length ? local.join(' o ') : mode === 'vision' ? 'Gemini Flash, GPT-4o o Claude Sonnet' : 'Nano Banana (Google), GPT Image (OpenAI) o un modelo de imágenes de OpenRouter';
  return `Consejo de modelos: ${picks}. Podés elegir otro modelo compatible; depende de tu API, disponibilidad y saldo. ${mode === 'generation' ? 'La generación puede tener costo, incluso con una cuenta de chat gratuita.' : ''}`.trim();
}

export function generationTarget(agent: Agent) {
  const provider = agent.imageProvider || agent.provider;
  const model = agent.imageModel || IMAGE_MODELS.generation[provider]?.[0] || agent.model;
  return { provider, model };
}

export function imageErrorMessage(code: string): string {
  if (code === 'IMAGE_TOO_LARGE') return 'La imagen supera 5 MB o 16 millones de píxeles. Enviá una imagen más chica.';
  if (code === 'IMAGE_FORMAT_INVALID') return 'Enviá una imagen válida en JPG, PNG o WebP.';
  if (code === 'IMAGE_ACCESS_DENIED') return 'La imagen no pertenece a este agente o ya no tenés acceso.';
  if (code === 'IMAGE_CREDENTIAL_REQUIRED') return 'Conectá una clave API del proveedor configurado para imágenes.';
  if (code === 'IMAGE_GENERATION_UNSUPPORTED') return 'Configurá un proveedor de generación de imágenes: Google, OpenAI u OpenRouter en Editar agente → Imágenes.';
  if (code === 'IMAGE_PROVIDER_REJECTED') return 'La API rechazó la imagen o el modelo. Revisá su compatibilidad, saldo y permisos; podés elegir otro modelo en Editar agente → Imágenes.';
  if (code === 'IMAGE_RATE_LIMITED') return 'La API de imágenes alcanzó su cuota. Revisá saldo y límites o intentá más tarde.';
  if (code === 'IMAGE_GENERATION_EMPTY') return 'El modelo no devolvió una imagen. Revisá si genera imágenes o si el proveedor bloqueó el pedido.';
  if (code === 'IMAGE_TIMEOUT') return 'La API de imágenes tardó demasiado. Revisá el historial antes de volver a intentar.';
  if (code === 'IMAGE_GENERATION_UNCERTAIN') return 'No pude confirmar o guardar la generación anterior. Para evitar otro cobro, no la repetí automáticamente. Revisá el historial y el proveedor antes de volver a pedirla.';
  return 'No se pudo procesar la imagen. Probá nuevamente o elegí otro modelo compatible.';
}

export function validImageModel(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.length <= 180 && (!value || /^[\w./:+-]+$/.test(value)));
}
