import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeToolMessage, toolErrorMessage } from '../src/lib/tool-feedback';
import type { ChatMessage } from '../src/types';

const message: ChatMessage = { id: 'persisted-result', agentId: 'agent-a', role: 'assistant', content: 'Result', timestamp: '2026-01-01T00:00:00Z' };
test('a saved result and repeated approval notification appear once', () => {
  const history = [message];
  assert.equal(mergeToolMessage(history, message), history);
  assert.equal(mergeToolMessage(mergeToolMessage([], message), message).length, 1);
});
test('separate calls with the same content remain separate results', () => {
  assert.equal(mergeToolMessage([message], { ...message, id: 'another-call' }).length, 2);
});
test('connection failures explain reconnection without exposing unexpected errors', () => {
  assert.match(toolErrorMessage('TOOL_CONNECTION_REQUIRED'), /Conectá nuevamente/);
  assert.match(toolErrorMessage('TOOL_CONNECTION_EXPIRED'), /Volvé a conectarlo/);
  assert.ok(!toolErrorMessage('secret-provider-response').includes('secret-provider-response'));
});
