import { createHash } from 'node:crypto';
import type { FigmaOperation } from '@/lib/figma-contract';
import { normalizeImage } from './chat-image-store';

const cache = new Map<string, { until: number; data: Record<string, any> }>();
const cooldowns = new Map<string, number>();
export async function boundedFigmaBody(response: Response, max: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('FIGMA_RESPONSE_TOO_LARGE'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('TOOL_PROVIDER_UNAVAILABLE');
  const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > max) throw new Error('FIGMA_RESPONSE_TOO_LARGE'); parts.push(chunk.value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(parts);
}
export async function figmaApi(token: string, path: string, method = 'GET', body?: unknown, fetcher: typeof fetch = fetch, fresh = false): Promise<Record<string, any>> {
  if (!/^\/(?:me|files\/[A-Za-z0-9]+(?:\/nodes|\/comments)?|images\/[A-Za-z0-9]+)(?:\?|$)/.test(path)) throw new Error('TOOL_INPUT_INVALID');
  const identity = createHash('sha256').update(token).digest('hex'); const key = identity + path;
  if ((cooldowns.get(identity) || 0) > Date.now()) throw new Error('TOOL_PROVIDER_RATE_LIMITED');
  const cached = cache.get(key);
  if (!fresh && method === 'GET' && cached && cached.until > Date.now()) return cached.data;
  const response = await fetcher('https://api.figma.com/v1' + path, { method, redirect: 'error', headers: { 'X-Figma-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429) {
      if (cooldowns.size >= 200) cooldowns.delete(cooldowns.keys().next().value!);
      const retry = Number(response.headers.get('retry-after')) || 60;
      cooldowns.set(identity, Date.now() + Math.min(86400, Math.max(1, retry)) * 1000);
      throw new Error('TOOL_PROVIDER_RATE_LIMITED');
    }
    throw new Error(response.status === 401 || response.status === 403 ? 'TOOL_PROVIDER_AUTH_FAILED' : response.status === 404 ? 'FIGMA_FILE_NOT_FOUND' : 'TOOL_PROVIDER_UNAVAILABLE');
  }
  const data = JSON.parse((await boundedFigmaBody(response, 2 * 1024 * 1024)).toString('utf8'));
  if (!data || typeof data !== 'object' || data.error || data.err) throw new Error('TOOL_OPERATION_FAILED');
  if (method === 'GET') { if (cache.size >= 100) cache.delete(cache.keys().next().value!); cache.set(key, { until: Date.now() + 20000, data }); }
  else for (const cacheKey of cache.keys()) if (cacheKey.startsWith(identity)) cache.delete(cacheKey);
  return data;
}
export function compactFigmaNode(node: any, budget = { remaining: 100 }): unknown {
  if (!node || budget.remaining-- <= 0) return null;
  const result: Record<string, unknown> = {};
  for (const key of ['id','name','type','characters','absoluteBoundingBox','layoutMode','itemSpacing','paddingLeft','paddingRight','paddingTop','paddingBottom','fills','style','componentId']) {
    if (node[key] !== undefined) result[key] = typeof node[key] === 'string' ? node[key].slice(0, 2500) : node[key];
  }
  if (Array.isArray(node.children)) { result.children = node.children.slice(0, 50).map((child: any) => compactFigmaNode(child, budget)).filter(Boolean); if (node.children.length > 50 || budget.remaining <= 0) result.truncated = true; }
  return result;
}
export async function figmaRead(token: string, operation: FigmaOperation, input: Record<string, unknown>) {
  const file = String(input.fileKey);
  if (operation === 'get_figma_file') {
    const data = await figmaApi(token, `/files/${file}?depth=${input.depth}`);
    return { name: data.name, version: data.version, role: data.role, document: compactFigmaNode(data.document), components: Object.entries(data.components || {}).slice(0, 30) };
  }
  if (operation === 'get_figma_nodes') {
    const data = await figmaApi(token, `/files/${file}/nodes?ids=${encodeURIComponent((input.nodeIds as string[]).join(','))}&depth=${input.depth}`);
    const budget = { remaining: 100 };
    return { name: data.name, version: data.version, nodes: Object.fromEntries(Object.entries(data.nodes || {}).map(([id, value]: [string, any]) => [id, compactFigmaNode(value?.document, budget)])) };
  }
  if (operation === 'list_figma_comments') {
    const data = await figmaApi(token, `/files/${file}/comments`);
    return { comments: (data.comments || []).slice(-30).map((item: any) => ({ id: item.id, message: String(item.message || '').slice(0,2000), user: item.user?.handle, created_at: item.created_at, resolved_at: item.resolved_at, client_meta: item.client_meta })) };
  }
  if (operation === 'post_figma_comment') {
    const data = await figmaApi(token, `/files/${file}/comments`, 'POST', { message: input.message, ...(input.nodeId ? { client_meta: { node_id: input.nodeId, node_offset: { x: 0, y: 0 } } } : {}) });
    return { id: data.id, message: data.message, created_at: data.created_at };
  }
  throw new Error('TOOL_NOT_SUPPORTED');
}
export async function renderFigmaNode(token: string, file: string, node: string, fetcher: typeof fetch = fetch) {
  const data = await figmaApi(token, `/images/${file}?ids=${encodeURIComponent(node)}&format=png&scale=0.5`, 'GET', undefined, fetcher);
  const raw = data.images?.[node]; if (typeof raw !== 'string') throw new Error('FIGMA_RENDER_FAILED');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['figma-alpha-api.s3.us-west-2.amazonaws.com','figma-alpha-api.s3.amazonaws.com','s3-alpha-sig.figma.com','s3-alpha.figma.com'].includes(url.hostname)) throw new Error('FIGMA_RENDER_FAILED');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('FIGMA_RENDER_FAILED');
  return normalizeImage(await boundedFigmaBody(response, 5 * 1024 * 1024));
}
