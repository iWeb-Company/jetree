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

test('a copied pending draft cannot be announced before the runner creates a real approval', async () => {
  const agent = { ...specialist, enabledPluginIds: ['plugin-gmail-core'] };
  let decisions = 0;
  let writes = 0;
  const result = await executeAgentChat(agent, 'Mandá un correo de prueba', [], [], {}, async (_agent, prompt) => {
    if (++decisions === 1) return JSON.stringify({ answer: 'Preparé la acción y quedó pendiente de tu aprobación.\nAcción pendiente: send_message' });
    assert.match(prompt, /todavía no se creó una aprobación/);
    return JSON.stringify({ toolId: 'plugin-gmail-core', operation: 'send_message', input: { to: 'test@example.invalid', subject: 'Test', body: 'Test' } });
  }, undefined, async () => { writes++; return { pendingApproval: true, approvalId: 'real-approval' }; });
  assert.equal(decisions, 2);
  assert.equal(writes, 1);
  assert.match(result.reply, /pendiente de tu aprobación/);
});

test('missing approval explanations are not mistaken for fabricated drafts', async () => {
  const agent = { ...specialist, enabledPluginIds: ['plugin-gmail-core'] };
  const result = await executeAgentChat(agent, 'Qué falta?', [], [], {}, async () => JSON.stringify({ answer: 'No hay una acción pendiente. Indicá el destinatario.' }), undefined, async () => { assert.fail('No tool needed'); });
  assert.match(result.reply, /Indicá el destinatario/);
});

test('a delegated follow-up retains the original mail reference and waits for approval', async () => {
  const mailAgent = { ...specialist, enabledPluginIds: ['plugin-gmail-core'] };
  let step = 0;
  const result = await executeAgentChat(makeAgent(), 'Contestale gracias', [mailAgent], [
    { role: 'user', content: 'Leé el correo de test@example.com' },
    { role: 'assistant', content: 'Mensaje mail123: confirmación de reunión de test@example.com' },
  ], {}, async (actingAgent, prompt) => {
    step++;
    if (actingAgent.roleType === 'manager') {
      assert.match(prompt, /specialist-1.*plugin-gmail-core/);
      return JSON.stringify({ decision: 'delegate', managerNotes: 'Correo', delegateTo: 'specialist-1', subTask: 'Contestale gracias' });
    }
    // Even when the planner omits the reference, the specialist receives the history.
    assert.match(prompt, /Mensaje mail123/);
    if (step === 2) return JSON.stringify({ toolId: 'plugin-gmail-core', operation: 'get_message', input: { messageId: 'mail123' } });
    assert.match(prompt, /sender@example.com/);
    return JSON.stringify({ toolId: 'plugin-gmail-core', operation: 'reply_message', input: { messageId: 'mail123', to: 'sender@example.com', body: 'Gracias' } });
  }, undefined, async (actingAgent, _tool, operation, input) => {
    assert.equal(actingAgent.id, mailAgent.id);
    if (operation === 'get_message') return { result: { id: 'mail123', from: 'sender@example.com', text: 'Reunión confirmada' } };
    assert.equal(operation, 'reply_message');
    assert.equal(input.to, 'sender@example.com');
    return { pendingApproval: true, approvalId: 'approval123' };
  });
  assert.equal(step, 3);
  assert.match(result.reply, /pendiente de tu aprobación/);
});

test('an agent with no enabled connectors receives the setup instruction without running tools', async () => {
  const result = await executeAgentChat(makeAgent({ roleType: 'independent', enabledPluginIds: [] }), 'Mostrame mis correos', [], [], {}, async (_agent, prompt) => {
    assert.match(prompt, /Conectores permitidos para este agente: ninguno/);
    assert.match(prompt, /Nunca lo actives/);
    return 'Habilitá Gmail en la configuración del agente.';
  }, undefined, async () => { assert.fail('Unauthorized executor reached'); });
  assert.match(result.reply, /Habilitá Gmail/);
});

test('managers and independent agents can run their enabled Gmail and web tools', async () => {
  for (const roleType of ['manager', 'independent'] as const) {
    const agent = makeAgent({ roleType, enabledPluginIds: ['plugin-gmail-core', 'plugin-web-search'] });
    let step = 0; const operations: string[] = [];
    const result = await executeAgentChat(agent, 'Find emails and videos', [specialist], [], {}, async () => {
      step++;
      if (roleType === 'manager' && step === 1) return JSON.stringify({ decision: 'direct', managerNotes: '', directResponse: 'Use tools' });
      const toolStep = step - (roleType === 'manager' ? 1 : 0);
      if (toolStep === 1) return JSON.stringify({ toolId: 'plugin-gmail-core', operation: 'search_messages', input: { query: 'is:unread' } });
      if (toolStep === 2) return JSON.stringify({ toolId: 'plugin-web-search', operation: 'search_youtube', input: { query: 'tutorial' } });
      return JSON.stringify({ answer: 'Found real results' });
    }, undefined, async (_agent, _tool, operation) => { operations.push(operation); return { result: [] }; });
    assert.deepEqual(operations, ['search_messages', 'search_youtube']);
    assert.equal(result.reply, 'Found real results');
  }
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
