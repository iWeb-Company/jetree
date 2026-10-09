// Test-only preload; refuses hosted databases and non-CI use. Never imported by app.
import assert from 'node:assert/strict';
import { appendFile, mkdir } from 'node:fs/promises';
assert.equal(process.env.JETREE_DISPOSABLE_CI, 'true');
assert.equal(process.env.CI, 'true');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const realFetch = globalThis.fetch;
const failedDeliveries = new Set();
const issuers = new Map([
  ['api.openai.com', ['sk-proj-synthetic-', 'openai']],
  ['api.deepseek.com', ['sk-synthetic-deepseek-', 'deepseek']],
  ['api.anthropic.com', ['sk-ant-api03-synthetic-', 'claude']],
  ['generativelanguage.googleapis.com', ['AIzaSynthetic-', 'gemini']],
  ['openrouter.ai', ['sk-or-v1-synthetic-', 'custom']],
]);
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.telegram.org') {
    assert.ok(url.pathname.includes('botsynthetic-audio-token/'), 'Fixture refuses real Telegram tokens');
    const operation = url.pathname.split('/').at(-1);
    const requestBody = options?.body ? JSON.parse(options.body) : {};
    await mkdir('artifacts', { recursive: true });
    await appendFile('artifacts/telegram-fixture-events.jsonl', JSON.stringify({ operation, chatId: requestBody.chat_id, fileId: requestBody.file_id }) + '\n');
    if (operation === 'getFile') return Response.json({ ok: true, result: { file_path: 'voice/synthetic.oga', file_size: 4 } });
    if (operation === 'synthetic.oga') return new Response('ogg!');
    assert.ok(['sendMessage', 'sendChatAction'].includes(operation));
    if (operation === 'sendMessage' && requestBody.chat_id === 54321 && !failedDeliveries.has(requestBody.chat_id)) {
      failedDeliveries.add(requestBody.chat_id);
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: true, result: true });
  }
  const issuer = issuers.get(url.hostname);
  if (!issuer) return realFetch(input, options);
  const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
  const key = headers.get('authorization')?.replace(/^Bearer /,'') || headers.get('x-api-key') || headers.get('x-goog-api-key') || '';
  // No real key leaves this disposable test process.
  if (!key.toLowerCase().includes('synthetic-')) throw new Error('Fixture refuses non-synthetic provider key');
  if (!key.startsWith(issuer[0]) || key.endsWith('-invalid')) return Response.json({ error: 'Rejected synthetic key' }, { status: 401 });
  if ((options?.method ?? (input instanceof Request ? input.method : 'GET')) === 'POST') {
    const body = JSON.parse(options?.body ?? await input.clone().text());
    if (issuer[1] === 'gemini') {
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'audio/ogg');
      return Response.json({ candidates: [{ content: { parts: [{ text: 'Respondé: audio comprendido' }] } }] });
    }
    assert.equal(body.model, 'synthetic-deepseek');
    const audioPrompt = JSON.stringify(body.messages).includes('[Transcripción de audio]');
    return Response.json({ id: 'synthetic', choices: [{ message: { role: 'assistant', content: audioPrompt ? 'Synthetic audio understood' : 'Synthetic DeepSeek API OK' } }] });
  }
  return issuer[1] === 'gemini'
    ? Response.json({ models: [{ name: 'models/synthetic-gemini', supportedGenerationMethods: ['generateContent'] }] })
    : Response.json({ data: [{ id: 'synthetic-' + issuer[1] }] });
};
