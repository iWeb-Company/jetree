import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const providers = { groq: 'https://api.groq.com/openai/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions' };
export function providerTarget(provider) { if (!providers[provider]) throw new Error('PROVIDER_UNSUPPORTED'); return providers[provider]; }
export function groqMessages(messages) {
  return messages.map(message => {
    const fields = ['role','content','name','tool_calls','tool_call_id'];
    const clean = Object.fromEntries(fields.filter(field => message[field] !== undefined).map(field => [field,message[field]]));
    if (Array.isArray(clean.content)) {
      if (!clean.content.every(part => part?.type === 'text' && typeof part.text === 'string')) throw new Error('GROQ_TEXT_ONLY');
      clean.content = clean.content.map(part => part.text).join('\n');
    }
    return clean;
  });
}
export async function errorCategory(upstream) {
  if (upstream.status === 429) { await upstream.body?.cancel(); return 'RATE_LIMIT'; }
  if (upstream.status === 413) { await upstream.body?.cancel(); return 'REQUEST_TOO_LARGE'; }
  const reader = upstream.body?.getReader(); if (!reader) return 'UNKNOWN';
  const chunks = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) return 'UNKNOWN'; chunks.push(part.value); }
    const error = JSON.parse(Buffer.concat(chunks).toString()).error;
    if (error?.code === 'tool_use_failed') return 'TOOL_GENERATION_FAILED';
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    for (const [word, category] of [['cache_control','CACHE_CONTROL_UNSUPPORTED'],['reasoning_content','REASONING_CONTENT_UNSUPPORTED'],['content','CONTENT_INVALID'],['role','ROLE_INVALID'],['schema','TOOL_SCHEMA_INVALID'],['tool','TOOL_REQUEST_INVALID'],['temperature','PARAMETER_INVALID'],['max_tokens','PARAMETER_INVALID'],['messages','MESSAGES_INVALID'],['model','MODEL_INVALID'],['token','TOKEN_LIMIT']]) if (message.includes(word)) return category;
  } catch { /* Error text must never escape the gateway. */ }
  finally { await reader.cancel().catch(() => {}); }
  return 'UNKNOWN';
}
export function gateway({ provider, key, token, model, limit = 40, fetcher = fetch, onDiagnostic = () => {} }) {
  const target = providerTarget(provider);
  if (!key || !token || !model || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('GATEWAY_CONFIG_INVALID');
  let calls = 0; let active = 0;
  return http.createServer(async (request, response) => {
    const deny = status => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'JETREE_GATEWAY_DENIED' })); };
    const supplied = Buffer.from(request.headers.authorization || ''); const expected = Buffer.from('Bearer ' + token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return deny(401);
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') return deny(403);
    if (calls >= limit || active >= 1) return deny(429);
    let data; const parts = []; let bytes = 0;
    try {
      for await (const part of request) { bytes += part.length; if (bytes > 512 * 1024) return deny(413); parts.push(part); }
      data = JSON.parse(Buffer.concat(parts).toString());
      if (data.model !== model || !Array.isArray(data.messages) || data.messages.length > 200 || !data.messages.every(message => message && ['user','assistant','system','tool','developer'].includes(message.role))) return deny(400);
      // Only ordinary inference fields; no caller-selected destination, key, model or headers.
      const allowed = ['model','messages','tools','tool_choice','stream','temperature','top_p','stop','parallel_tool_calls'];
      data = Object.fromEntries(allowed.filter(field => data[field] !== undefined).map(field => [field, data[field]]));
      if (provider === 'groq') data.messages = groqMessages(data.messages);
      data.max_tokens = 4096;
    } catch { return deny(400); }
    calls++; active++;
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 120000);
    response.on('close', () => { if (!response.writableEnded) abort.abort(); });
    try {
      const upstream = await fetcher(target, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(data), redirect: 'error', signal: abort.signal });
      // Never return provider error bodies: they may contain credentials or account information.
      if (!upstream.ok || !upstream.body) { const category = await errorCategory(upstream); onDiagnostic({ code: 'PROVIDER_HTTP_ERROR', status: upstream.status, category }); return deny(upstream.status === 429 || upstream.status === 413 ? upstream.status : 502); }
      response.writeHead(200, { 'Content-Type': data.stream ? 'text/event-stream' : 'application/json', 'Cache-Control': 'no-store' });
      let size = 0; const reader = upstream.body.getReader();
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 4 * 1024 * 1024) throw new Error('RESPONSE_LIMIT');
        response.write(chunk.value); }
      } finally { await reader.cancel(); }
      response.end();
    } catch { onDiagnostic({ code: 'PROVIDER_TRANSPORT_ERROR' }); if (!response.headersSent) deny(502); else response.destroy(); }
    finally { clearTimeout(timer); active--; }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = gateway({ provider: process.env.JETREE_CODE_PROVIDER, key: process.env.JETREE_CODE_API_KEY, token: process.env.JETREE_CODE_GATEWAY_TOKEN, model: process.env.JETREE_CODE_MODEL, onDiagnostic: event => console.log('JETREE_DIAGNOSTIC ' + JSON.stringify(event)) });
  server.listen(8080, '0.0.0.0');
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 8 * 60 * 1000).unref();
}
