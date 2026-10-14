import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeWithGroq } from '../../src/lib/openai';

test('Groq text decisions disable native calls and retain the selected model and prompt', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).hostname, 'api.groq.com');
    const body = await request.json();
    requests++;
    if (body.tool_choice !== 'none') return Response.json({ error: { code: 'tool_use_failed', message: 'Native tools were not declared' } }, { status: 400 });
    assert.equal(body.model, 'openai/gpt-oss-20b');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Synthetic MCP decision prompt' }]);
    assert.equal(body.tools, undefined);
    return Response.json({ choices: [{ message: { content: '{"toolId":"plugin-custom-mcp","operation":"list_mcp_servers","input":{}}' } }] });
  };
  try {
    const answer = await analyzeWithGroq('Synthetic MCP decision prompt', 'synthetic-test-key', 'openai/gpt-oss-20b');
    assert.equal(JSON.parse(answer!).operation, 'list_mcp_servers');
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});
