import type { Agent, AIProvider } from '@/types';
import { MAX_IMAGE_BYTES, type ImageInput } from '@/lib/chat-images';

async function boundedJson(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 429 || response.status === 402 ? 'IMAGE_RATE_LIMITED' : 'IMAGE_PROVIDER_REJECTED');
  }
  if (!response.body) throw new Error('IMAGE_PROVIDER_FAILED');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 24 * 1024 * 1024) { await reader.cancel(); throw new Error('IMAGE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('IMAGE_PROVIDER_FAILED'); }
}

async function request(url: string, headers: Record<string, string>, body: string | FormData, fetcher: typeof fetch, timeout: number) {
  try {
    return await boundedJson(await fetcher(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(timeout) }));
  } catch (error) {
    if (error instanceof Error && /^IMAGE_/.test(error.message)) throw error;
    throw new Error(error instanceof Error && /abort|timeout/i.test(error.name + error.message) ? 'IMAGE_TIMEOUT' : 'IMAGE_PROVIDER_FAILED');
  }
}

function dataUrl(image: ImageInput) { return `data:${image.mimeType};base64,${image.bytes.toString('base64')}`; }

export async function describeImages(agent: Agent, prompt: string, images: ImageInput[], key: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (prompt.length > 24_000) throw new Error('IMAGE_CONTEXT_TOO_LARGE');
  if (!key) throw new Error('IMAGE_CREDENTIAL_REQUIRED');
  const model = agent.visionModel || agent.model;
  let result: any;
  if (agent.provider === 'gemini') {
    result = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'Content-Type': 'application/json', 'x-goog-api-key': key }, JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, ...images.flatMap(image => [{ text: image.label || 'Imagen del mensaje actual' }, { inlineData: { mimeType: image.mimeType, data: image.bytes.toString('base64') } }])] }], generationConfig: { maxOutputTokens: 4096 } }), fetcher, 25_000);
    const text = result?.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
    if (text) return text;
  } else if (agent.provider === 'claude') {
    result = await request('https://api.anthropic.com/v1/messages', { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.flatMap(image => [{ type: 'text', text: image.label || 'Imagen del mensaje actual' }, { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.bytes.toString('base64') } }])] }] }), fetcher, 25_000);
    const text = result?.content?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
    if (text) return text;
  } else {
    const urls: Partial<Record<AIProvider, string>> = { openai: 'https://api.openai.com/v1/chat/completions', custom: 'https://openrouter.ai/api/v1/chat/completions', groq: 'https://api.groq.com/openai/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions' };
    const url = urls[agent.provider]; if (!url) throw new Error('IMAGE_PROVIDER_REJECTED');
    result = await request(url, { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.flatMap(image => [{ type: 'text', text: image.label || 'Imagen del mensaje actual' }, { type: 'image_url', image_url: { url: dataUrl(image) } }])] }] }), fetcher, 25_000);
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text) return text;
  }
  throw new Error('IMAGE_PROVIDER_REJECTED');
}

function decodeImage(data: unknown, mimeType: unknown): ImageInput {
  if (typeof data !== 'string' || !data || data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('IMAGE_GENERATION_EMPTY');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  return { bytes, mimeType: typeof mimeType === 'string' ? mimeType : 'image/png' };
}

export async function generateImage(provider: AIProvider, model: string, prompt: string, key: string, images: ImageInput[] = [], fetcher: typeof fetch = fetch): Promise<ImageInput> {
  if (!key) throw new Error('IMAGE_CREDENTIAL_REQUIRED');
  if (provider === 'gemini') {
    const result = await request('https://generativelanguage.googleapis.com/v1beta/interactions', { 'Content-Type': 'application/json', 'x-goog-api-key': key }, JSON.stringify({ model, store: false, input: [{ type: 'text', text: prompt }, ...images.map(image => ({ type: 'image', mime_type: image.mimeType, data: image.bytes.toString('base64') }))], response_format: { type: 'image', mime_type: 'image/png' } }), fetcher, 150_000);
    const image = result?.steps?.filter((step: any) => step.type === 'model_output').flatMap((step: any) => step.content || []).find((part: any) => part.type === 'image');
    if (!image) throw new Error('IMAGE_GENERATION_EMPTY');
    return decodeImage(image.data, image.mime_type);
  }
  if (provider === 'openai') {
    let body: string | FormData; let url: string;
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (images.length) {
      body = new FormData(); body.set('model', model); body.set('prompt', prompt); body.set('n', '1');
      images.forEach((image, index) => (body as FormData).append('image[]', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `reference-${index}.png`));
      url = 'https://api.openai.com/v1/images/edits';
    } else {
      body = JSON.stringify({ model, prompt, n: 1, ...(!model.startsWith('gpt-image-') ? { response_format: 'b64_json' } : {}) });
      headers['Content-Type'] = 'application/json'; url = 'https://api.openai.com/v1/images/generations';
    }
    const result = await request(url, headers, body, fetcher, 150_000);
    return decodeImage(result?.data?.[0]?.b64_json, 'image/png');
  }
  if (provider === 'custom') {
    const result = await request('https://openrouter.ai/api/v1/images', { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, JSON.stringify({ model, prompt, ...(images.length ? { input_references: images.map(image => ({ type: 'image_url', image_url: { url: dataUrl(image) } })) } : {}) }), fetcher, 150_000);
    return decodeImage(result?.data?.[0]?.b64_json, result?.data?.[0]?.media_type);
  }
  throw new Error('IMAGE_GENERATION_UNSUPPORTED');
}
