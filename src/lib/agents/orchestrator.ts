import { Agent, AgentActivityLog } from '@/types';
import { ALL_CHATGPT_WORK_PLUGINS } from '@/lib/agents/plugins';
import { allowedSubordinates, resolveDelegationTarget } from '@/lib/agents/delegation-policy';
import { parseManagerPlan } from '@/lib/agents/planner';
import { callAIProvider, ProviderCall } from '@/lib/agents/provider-adapter';

export type ExecutionResult = {
  reply: string;
  delegation?: {
    assignedToAgentId: string;
    assignedToAgentName: string;
    taskSummary: string;
    provider: Agent['provider'];
    model: string;
    specialistResult?: string;
  };
  logs: AgentActivityLog[];
};

function formatPluginsContext(agent: Agent): string {
  const activePlugins = ALL_CHATGPT_WORK_PLUGINS.filter(plugin => agent.enabledPluginIds?.includes(plugin.id));
  if (activePlugins.length === 0) return '';
  return '\nHerramientas mencionadas para este agente (no disponibles como conectores ejecutables en esta fase):\n'
    + activePlugins.map(plugin => '- ' + plugin.name + ': ' + plugin.description).join('\n')
    + '\nNo afirmes haber usado una herramienta externa.\n';
}

function buildAgentPrompt(agent: Agent, userMessage: string, history: { role: 'user' | 'assistant'; content: string }[]) {
  return 'Instrucciones del agente:\n' + agent.systemPrompt.slice(0, 6000) + '\n'
    + formatPluginsContext(agent)
    + '\nHistorial:\n' + history.slice(-8).map(item => item.role + ': ' + item.content.slice(0, 2000)).join('\n')
    + '\n\nSolicitud actual:\n' + userMessage;
}

export async function executeAgentChat(
  agent: Agent,
  userMessage: string,
  availableAgents: Agent[],
  chatHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  apiKeys: Record<string, string> = {},
  providerCall: ProviderCall = callAIProvider,
  onDelegation?: (delegation: NonNullable<ExecutionResult['delegation']>) => Promise<void>,
): Promise<ExecutionResult> {
  const logs: AgentActivityLog[] = [];
  const now = () => new Date().toISOString();
  const log = (entry: Omit<AgentActivityLog, 'id' | 'timestamp'>) => logs.push({
    id: 'log-' + Date.now() + '-' + (logs.length + 1),
    timestamp: now(),
    ...entry,
  });

  if (!userMessage.trim() || userMessage.length > 8000) throw new Error('INVALID_USER_MESSAGE');

  const subordinates = allowedSubordinates(agent, availableAgents);
  if (agent.roleType !== 'manager' || subordinates.length === 0) {
    log({ agentId: agent.id, agentName: agent.name, type: 'agent_executing', message: agent.name + ' inició la ejecución.' });
    const reply = await providerCall(agent, buildAgentPrompt(agent, userMessage, chatHistory), apiKeys);
    if (!reply.trim()) throw new Error('EMPTY_PROVIDER_RESPONSE');
    log({ agentId: agent.id, agentName: agent.name, type: 'completed', message: agent.name + ' completó la respuesta.' });
    return { reply: reply.slice(0, 11_500), logs };
  }

  log({
    agentId: agent.id,
    agentName: agent.name,
    type: 'manager_analysis',
    message: agent.name + ' analiza la solicitud con ' + subordinates.length + ' subordinados permitidos.',
  });

  const roster = subordinates.map(item => '- ID: ' + item.id + '; nombre: ' + item.name + '; especialidad: ' + item.description).join('\n');
  const recentHistory = chatHistory.slice(-4).map(item => item.role + ': ' + item.content.slice(0, 1500)).join('\n');
  const managerPrompt = 'Sos ' + agent.name + ', manager de un equipo de agentes.\n'
    + 'Instrucciones:\n' + agent.systemPrompt.slice(0, 6000) + '\n'
    + formatPluginsContext(agent)
    + 'Subordinados permitidos:\n' + roster + '\n\n'
    + 'Historial reciente:\n' + recentHistory + '\n\n'
    + 'Solicitud:\n' + userMessage + '\n\n'
    + 'Respondé solo JSON válido. Contrato directo: {"decision":"direct","managerNotes":"...","directResponse":"respuesta"}\n'
    + 'Contrato de delegación: {"decision":"delegate","managerNotes":"...","delegateTo":"ID exacto","subTask":"instrucción concreta"}\n'
    + 'No inventes IDs ni delegues a un agente que no figure en la lista.';

  const rawPlan = await providerCall(agent, managerPrompt, apiKeys);
  const plan = parseManagerPlan(rawPlan, subordinates.map(item => item.id));
  if (plan.decision === 'direct') {
    log({ agentId: agent.id, agentName: agent.name, type: 'completed', message: agent.name + ' resolvió la consulta directamente.' });
    return { reply: plan.directResponse.slice(0, 11_500), logs };
  }

  const specialist = resolveDelegationTarget(agent, subordinates, plan.delegateTo);
  const delegation = {
    assignedToAgentId: specialist.id,
    assignedToAgentName: specialist.name,
    taskSummary: plan.subTask,
    provider: specialist.provider,
    model: specialist.model,
  };
  await onDelegation?.(delegation);
  log({
    agentId: agent.id,
    agentName: agent.name,
    type: 'delegated',
    message: agent.name + ' delegó la tarea a ' + specialist.name + '.',
    details: plan.subTask,
    targetAgentId: specialist.id,
    targetAgentName: specialist.name,
  });
  log({ agentId: specialist.id, agentName: specialist.name, type: 'agent_executing', message: specialist.name + ' inició la tarea delegada.' });

  const specialistPrompt = 'Sos ' + specialist.name + '.\nInstrucciones:\n' + specialist.systemPrompt.slice(0, 6000) + '\n'
    + formatPluginsContext(specialist)
    + '\nTarea asignada por ' + agent.name + ':\n' + plan.subTask
    + '\n\nSolicitud original:\n' + userMessage;
  const specialistResult = await providerCall(specialist, specialistPrompt, apiKeys);
  if (!specialistResult.trim()) throw new Error('EMPTY_PROVIDER_RESPONSE');
  log({ agentId: specialist.id, agentName: specialist.name, type: 'completed', message: specialist.name + ' completó la tarea.' });

  const reply = '🧠 **' + agent.name + ' (Manager)**\n' + plan.managerNotes + '\n\n'
    + '**Resultado de ' + specialist.name + ':**\n' + specialistResult;
  return {
    reply: reply.slice(0, 11_500),
    delegation: {
      ...delegation,
      specialistResult: specialistResult.slice(0, 8000),
    },
    logs,
  };
}
