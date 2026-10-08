import assert from 'node:assert/strict';
import { test } from 'node:test';
import { respondWithTools } from '../../src/lib/agents/tool-loop';
import { parseToolRequest, jetreeBranchName } from '../../src/lib/agents/tool-catalog';
import type { Agent } from '../../src/types';

const agent = { id: 'agent', provider: 'gemini', enabledPluginIds: ['plugin-github-core', 'plugin-google-drive-core'] } as Agent;

test('reads a tool result and answers without repeating the request', async () => {
  let count = 0;
  const answer = await respondWithTools(agent, 'Listá commits de dev', {}, async (_agent, prompt) => {
    count++;
    if (count === 1) return JSON.stringify({ toolId: 'plugin-github-core', operation: 'list_commits', input: { owner: 'org', repo: 'repo', branch: 'dev' } });
    assert.match(prompt, /commit-123/);
    return JSON.stringify({ answer: 'El último commit es commit-123.' });
  }, async (_agent, _id, _operation, input) => {
    assert.equal(input.branch, 'dev');
    return { result: [{ sha: 'commit-123' }] };
  });
  assert.equal(count, 2);
  assert.equal(answer, 'El último commit es commit-123.');
});

test('write stops at approval and never reports completion', async () => {
  let calls = 0;
  const reply = await respondWithTools(agent, 'Crear rama', {}, async () => JSON.stringify({ toolId: 'plugin-github-core', operation: 'create_branch', input: { owner: 'org', repo: 'repo', base: 'dev', branch: 'test' } }), async (_agent, _id, _operation, input) => {
    calls++; assert.equal(input.branch, 'jetree-branch-test');
    return { pendingApproval: true, approvalId: 'approval' };
  });
  assert.equal(calls, 1); assert.match(reply, /pendiente/);
});

test('disabled tools and malformed paths cannot reach executor', async () => {
  await assert.rejects(respondWithTools({ ...agent, enabledPluginIds: ['plugin-google-drive-core'] }, '', {}, async () => JSON.stringify({ toolId: 'plugin-github-core', operation: 'list_repositories', input: {} }), async () => { assert.fail('executor reached'); }), /TOOL_NOT_AUTHORIZED/);
  for (const branch of ['../dev', 'main.lock', 'foo/bar', 'test..x']) assert.throws(() => jetreeBranchName(branch), /TOOL_INPUT_INVALID/);
  assert.equal(jetreeBranchName('jetree-branch-demo'), 'jetree-branch-demo');
  assert.equal(parseToolRequest('plugin-google-drive-core', 'trash_file', { fileId: 'file' }).write, true);
  assert.throws(() => parseToolRequest('plugin-github-core', 'list_commits', { owner: 'org', repo: 'repo', branch: '../dev' }), /TOOL_INPUT_INVALID/);
});

test('repeated reads are bounded and malformed model output executes nothing', async () => {
  let calls = 0;
  const reply = await respondWithTools(agent, '', {}, async () => JSON.stringify({ toolId: 'plugin-github-core', operation: 'list_repositories', input: {} }), async () => { calls++; return { result: [] }; });
  assert.equal(calls, 1); assert.match(reply, /repetida/);
  const invalid = await respondWithTools(agent, '', {}, async () => 'not json', async () => { assert.fail('executor reached'); });
  assert.match(invalid, /No se ejecutó/);
});
