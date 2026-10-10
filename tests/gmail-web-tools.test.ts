import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToolRequest } from '../src/lib/agents/tool-catalog';
import { composeMail, gmailRequest, mailText } from '../src/lib/server/gmail-tools';
import { webSearch } from '../src/lib/server/web-search';
import { googleToolScopeGranted } from '../src/lib/google-tool-scopes';

test('Gmail reads and writes preserve approval classification and reject injection', () => {
  assert.equal(parseToolRequest('plugin-gmail-core', 'search_messages', { query: 'is:unread' }).write, false);
  assert.equal(parseToolRequest('plugin-gmail-core', 'get_message', { messageId: 'abc' }).write, false);
  for (const operation of ['trash_message', 'restore_message', 'mark_read']) assert.equal(parseToolRequest('plugin-gmail-core', operation, { messageId: 'abc' }).write, true);
  for (const operation of ['send_message', 'reply_message']) assert.equal(parseToolRequest('plugin-gmail-core', operation, { messageId: 'abc', to: 'test@example.com', subject: 'Test', body: 'Reply' }).write, true);
  assert.throws(() => parseToolRequest('plugin-gmail-core', 'send_message', { to: 'test@example.com\r\nBcc: other@example.com', subject: 'Test', body: 'Hello' }), /TOOL_INPUT_INVALID/);
  assert.throws(() => parseToolRequest('plugin-gmail-core', 'send_message', { to: 'test@example.com', subject: 'Test\nBcc: x', body: 'Hello' }), /TOOL_INPUT_INVALID/);
  assert.throws(() => parseToolRequest('plugin-gmail-core', 'get_message', { messageId: '../other' }), /TOOL_INPUT_INVALID/);
  assert.throws(() => parseToolRequest('plugin-web-search', 'search_web', { query: 'test', maxResults: 100 }), /TOOL_INPUT_INVALID/);
  assert.equal(googleToolScopeGranted('gmail', 'https://www.googleapis.com/auth/drive.file'), false);
  assert.equal(googleToolScopeGranted('gmail', 'openid https://www.googleapis.com/auth/gmail.modify'), true);
});

test('Gmail replies use real thread headers and the approved recipient', async () => {
  const calls: Array<{ url: string; body?: Record<string, string> }> = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(init?.method === 'POST' ? { id: 'sent' } : { id: 'original', threadId: 'thread', payload: { headers: [{ name: 'Subject', value: 'Hola' }, { name: 'Message-ID', value: '<original@example.com>' }] } });
  }) as typeof fetch;
  await gmailRequest('synthetic', 'reply_message', { messageId: 'original', to: 'approved@example.com', body: '¡Gracias!' }, fetcher);
  assert.equal(calls[1].body?.threadId, 'thread');
  const mime = Buffer.from(calls[1].body!.raw, 'base64url').toString();
  assert.match(mime, /To: approved@example.com/);
  assert.match(mime, /In-Reply-To: <original@example.com>/);
  assert.match(mime, /References: <original@example.com>/);
  assert.throws(() => composeMail('a@example.com', 'Hi', 'body', { messageId: 'bad\nheader', references: '' }), /TOOL_INPUT_INVALID/);
  assert.equal(mailText({ mimeType: 'text/plain', body: { data: Buffer.from('Hello').toString('base64url') } }), 'Hello');
});

test('Gmail trash does not permanently delete and surfaces provider failure safely', async () => {
  await gmailRequest('synthetic', 'trash_message', { messageId: 'mail' }, (async (url, init) => { assert.match(String(url), /\/messages\/mail\/trash$/); assert.equal(init?.method, 'POST'); return Response.json({ id: 'mail' }); }) as typeof fetch);
  await assert.rejects(gmailRequest('synthetic', 'get_message', { messageId: 'mail' }, (async () => new Response('secret provider body', { status: 401 })) as typeof fetch), /TOOL_PROVIDER_AUTH_FAILED/);
});

test('YouTube searches restrict domains and discard non-video and unsafe links', async () => {
  const prior = process.env.TAVILY_API_KEY; process.env.TAVILY_API_KEY = 'synthetic';
  try {
    const result = await webSearch('search_youtube', { query: 'test', maxResults: 5 }, (async (url, init) => {
      assert.equal(String(url), 'https://api.tavily.com/search');
      const body = JSON.parse(String(init?.body)); assert.deepEqual(body.include_domains, ['youtube.com', 'youtu.be']); assert.equal(body.search_depth, 'basic'); assert.equal(body.auto_parameters, false);
      return Response.json({ results: [{ url: 'https://www.youtube.com/watch?v=abc', title: 'video' }, { url: 'https://youtube.com/channel/abc' }, { url: 'https://evil.com/watch?v=abc' }, { url: 'javascript:alert(1)' }] });
    }) as typeof fetch);
    assert.equal(result.length, 1);
    delete process.env.TAVILY_API_KEY;
    await assert.rejects(webSearch('search_web', { query: 'test' }), /TOOL_SEARCH_NOT_CONFIGURED/);
  } finally { if (prior === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = prior; }
});
