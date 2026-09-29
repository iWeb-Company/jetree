import test from 'node:test';
import assert from 'node:assert/strict';
import { assertToolConnectionConnected, assertToolEnabled, parseToolRequest, TOOL_CONNECTORS } from '../src/lib/agents/tool-catalog';

test('only implemented GitHub and Drive connectors are advertised as executable', () => {
  assert.deepEqual(TOOL_CONNECTORS.map(item => item.id), ['plugin-github-core', 'plugin-google-drive-core']);
});

test('GitHub reads are bounded and classified as non-writing', () => {
  const request = parseToolRequest('plugin-github-core', 'get_file', { owner: 'iWeb-Company', repo: 'jetree', path: 'README.md' });
  assert.equal(request.provider, 'github');
  assert.equal(request.write, false);
});

test('GitHub writes require the explicit approval path', () => {
  const request = parseToolRequest('plugin-github-core', 'create_issue', { owner: 'iWeb-Company', repo: 'jetree', title: 'Issue', body: 'Description' });
  assert.equal(request.write, true);
});

test('Drive document creation is classified as a write', () => {
  const request = parseToolRequest('plugin-google-drive-core', 'create_doc', { name: 'Minutes', content: 'Text' });
  assert.equal(request.write, true);
  assert.equal(request.provider, 'google_drive');
});

test('unsupported connectors and operations are rejected', () => {
  assert.throws(() => parseToolRequest('plugin-gmail', 'send', {}), /TOOL_NOT_SUPPORTED/);
  assert.throws(() => parseToolRequest('plugin-github-core', 'delete_repository', {}), /TOOL_NOT_SUPPORTED/);
});

test('invalid GitHub paths and oversized write content are rejected', () => {
  assert.throws(() => parseToolRequest('plugin-github-core', 'get_file', { owner: 'a', repo: 'b', path: '../secrets' }), /TOOL_INPUT_INVALID/);
  assert.throws(() => parseToolRequest('plugin-github-core', 'create_file', { owner: 'a', repo: 'b', path: 'ok.txt', message: 'add', content: 'x'.repeat(12_001) }), /TOOL_INPUT_INVALID/);
});

test('an agent cannot invoke a connector that is not enabled for it', () => {
  assert.throws(() => assertToolEnabled(['plugin-google-drive-core'], 'plugin-github-core'), /TOOL_NOT_AUTHORIZED/);
  assert.doesNotThrow(() => assertToolEnabled(['plugin-github-core'], 'plugin-github-core'));
});

test('revoked and expired connections cannot authorize new calls', () => {
  assert.throws(() => assertToolConnectionConnected('disconnected'), /TOOL_CONNECTION_REQUIRED/);
  assert.throws(() => assertToolConnectionConnected('expired'), /TOOL_CONNECTION_EXPIRED/);
  assert.doesNotThrow(() => assertToolConnectionConnected('connected'));
});
