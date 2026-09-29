import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentChat } from '../src/lib/agents/orchestrator';
import { parseManagerPlan } from '../src/lib/agents/planner';
import { Agent } from '../src/types';
import { AgentEngineError } from '../src/lib/agents/provider-adapter';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'manager-1',
    name: 'Manager',
    description: 'Coordinates',
    departmentId: 'dept-1',
    roleType: 'manager',
    subordinateIds: ['specialist-1'],
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: 'Coordinate work.',
    status: 'idle',
    ...overrides,
  };
}

const specialist = makeAgent({
  id: 'specialist-1',
  name: 'Specialist',
  roleType: 'independent',
  subordinateIds: [],
  description: 'Writes code',
});

test('manager plans require valid JSON and an allowed subordinate ID', () => {
  assert.throws(() => parseManagerPlan('not json', ['specialist-1']), /MANAGER_DECISION_INVALID/);
  assert.throws(() => parseManagerPlan(
    '{"decision":"delegate","delegateTo":"other","subTask":"work"}',
    ['specialist-1'],
  ), /DELEGATION_TARGET_NOT_ALLOWED/);
});

test('independent agents execute directly and produce a completed result', async () => {
  let calls = 0;
  const result = await executeAgentChat(
    makeAgent({ roleType: 'independent', subordinateIds: [] }),
    'Help me',
    [],
    [],
    {},
    async () => { calls += 1; return 'Done'; },
  );
  assert.equal(calls, 1);
  assert.equal(result.reply, 'Done');
  assert.equal(result.logs.at(-1)?.type, 'completed');
});

test('manager delegates only to the exact allowed subordinate and synthesizes its result', async () => {
  const prompts: string[] = [];
  const result = await executeAgentChat(
    makeAgent(),
    'Write a feature',
    [specialist],
    [],
    {},
    async (_agent, prompt) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? '{"decision":"delegate","managerNotes":"Delegating code work.","delegateTo":"specialist-1","subTask":"Implement it"}'
        : 'Feature complete.';
    },
  );
  assert.equal(prompts.length, 2);
  assert.equal(result.delegation?.assignedToAgentId, 'specialist-1');
  assert.match(result.reply, /Feature complete/);
});

test('manager with no permitted subordinate answers directly without arbitrary fallback', async () => {
  const result = await executeAgentChat(
    makeAgent({ subordinateIds: ['missing'] }),
    'Summarize this',
    [],
    [],
    {},
    async () => 'Direct answer',
  );
  assert.equal(result.reply, 'Direct answer');
  assert.equal(result.delegation, undefined);
});

test('provider failures reject the run instead of logging completion', async () => {
  await assert.rejects(
    executeAgentChat(
      makeAgent({ roleType: 'independent', subordinateIds: [] }),
      'Run this',
      [],
      [],
      {},
      async () => { throw new AgentEngineError('PROVIDER_TIMEOUT'); },
    ),
    /PROVIDER_TIMEOUT/,
  );
});
