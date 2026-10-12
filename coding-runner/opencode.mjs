export function engineConfig(model, gatewayToken) {
  if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,150}$/.test(model)) throw new Error('MODEL_INVALID');
  return {
    model: 'jetree/' + model, small_model: 'jetree/' + model, enabled_providers: ['jetree'], share: 'disabled', autoupdate: false, plugin: [], mcp: {}, lsp: false, formatter: false,
    provider: { jetree: { npm: '@ai-sdk/openai-compatible@3.0.67', name: 'Jetree isolated gateway', options: { baseURL: 'http://broker:8080/v1', apiKey: gatewayToken }, models: { [model]: { name: model, limit: { context: 16000, output: 4096 } } } } },
    permission: { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', edit: 'allow', bash: 'allow', external_directory: 'deny', doom_loop: 'deny' },
  };
}
export class OpenCodeAdapter {
  constructor(base, password, fetcher = fetch) {
    const url = new URL(base);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || !password) throw new Error('ENGINE_ENDPOINT_INVALID');
    this.base = url.origin; this.password = password; this.fetcher = fetcher;
  }
  async request(route, body, timeout = 10000) {
    if (!/^\/(?:global\/health|session(?:\/[A-Za-z0-9_-]+(?:\/(?:message|abort))?)?)$/.test(route)) throw new Error('ENGINE_ROUTE_INVALID');
    const response = await this.fetcher(this.base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Basic ' + Buffer.from('opencode:' + this.password).toString('base64'), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(timeout) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('ENGINE_REQUEST_FAILED'); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('ENGINE_RESPONSE_INVALID');
    let size = 0; const chunks = [];
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2 * 1024 * 1024) throw new Error('ENGINE_RESPONSE_LIMIT'); chunks.push(part.value); } }
    finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  health() { return this.request('/global/health'); }
  async start() { const session = await this.request('/session', { title: 'Jetree code experiment' }); if (!/^ses_[A-Za-z0-9]+$/.test(session.id)) throw new Error('ENGINE_SESSION_INVALID'); return session.id; }
  message(id, prompt, model) { return this.request('/session/' + id + '/message', { model: { providerID: 'jetree', modelID: model }, parts: [{ type: 'text', text: prompt }] }, 240000); }
  abort(id) { return this.request('/session/' + id + '/abort', {}); }
}
