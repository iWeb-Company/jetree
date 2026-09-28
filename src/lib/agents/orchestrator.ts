import { Agent, AgentActivityLog } from '@/types';
import { analyzeWithChatGPT, analyzeWithOpenRouter } from '@/lib/openai';
import { analyzeWithGemini } from '@/lib/gemini';
import { analyzeWithClaude } from '@/lib/claude';
import { ALL_CHATGPT_WORK_PLUGINS } from '@/lib/agents/plugins';

export type ExecutionResult = {
  reply: string;
  delegation?: {
    assignedToAgentId: string;
    assignedToAgentName: string;
    taskSummary: string;
    specialistResult?: string;
  };
  logs: AgentActivityLog[];
};

// Generar bloque de contexto con las herramientas/plugins activos del agente
function formatPluginsContext(agent: Agent): string {
  const activePlugins = ALL_CHATGPT_WORK_PLUGINS.filter(p => agent.enabledPluginIds?.includes(p.id));
  if (activePlugins.length === 0) return '';

  return `
HERRAMIENTAS Y PLUGINS DISPONIBLES (Estilo Work/Extensions):
Tienes habilitadas las siguientes herramientas. Solo debes usarlas cuando el runtime las exponga y devolver un error claro si la conexión no está disponible:
${activePlugins.map(p => `- ${p.icon} ${p.name} (${p.category}): ${p.description}`).join('\n')}
Si el usuario te solicita una acción que dependa de estos plugins (ej. revisar un PR de GitHub, leer un doc de Drive, interactuar con Slack o generar un diseño), indica claramente cómo la utilizas para enriquecer tu entrega.
`;
}

// Función auxiliar para invocar el proveedor de IA correspondiente
async function callAIProvider(agent: Agent, prompt: string, apiKeys: Record<string, string>): Promise<string> {
  if (agent.provider === 'claude') {
    return (await analyzeWithClaude(prompt, apiKeys.claude, agent.model)) || 'Sin respuesta de Claude.';
  }
  if (agent.provider === 'openai') {
    return (await analyzeWithChatGPT(prompt, apiKeys.openai, agent.model)) || 'Sin respuesta de OpenAI.';
  }
  if (agent.provider === 'gemini') {
    return (await analyzeWithGemini(prompt, apiKeys.gemini, agent.model)) || 'Sin respuesta de Gemini.';
  }
  if (agent.provider === 'custom') {
    return (await analyzeWithOpenRouter(prompt, apiKeys.custom, agent.model)) || 'Sin respuesta del proveedor externo.';
  }
  throw new Error('UNSUPPORTED_PROVIDER');
}

export async function executeAgentChat(
  agent: Agent,
  userMessage: string,
  availableAgents: Agent[],
  chatHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  apiKeys: Record<string, string> = {},
): Promise<ExecutionResult> {
  const logs: AgentActivityLog[] = [];
  const now = () => new Date().toISOString();
  const pluginsText = formatPluginsContext(agent);

  // 1. CASO AGENTE INDEPENDIENTE: Responde directamente según su especialidad
  if (agent.roleType === 'independent' || !agent.subordinateIds || agent.subordinateIds.length === 0) {
    logs.push({
      id: `log-${Date.now()}-1`,
      timestamp: now(),
      agentId: agent.id,
      agentName: agent.name,
      type: 'agent_executing',
      message: `${agent.name} está procesando la solicitud (${agent.provider.toUpperCase()} - ${agent.model}).`,
    });

    const prompt = `System Prompt: ${agent.systemPrompt}
${pluginsText}
    
Historial previo:
${chatHistory.map(h => `${h.role === 'user' ? 'Usuario' : agent.name}: ${h.content}`).join('\n')}

Instrucción del usuario:
"${userMessage}"

Por favor responde directamente aplicando tu especialidad.`;

    let responseText = '';
    try {
      responseText = await callAIProvider(agent, prompt, apiKeys);
    } catch {
      throw new Error('PROVIDER_EXECUTION_FAILED');
    }

    logs.push({
      id: `log-${Date.now()}-2`,
      timestamp: now(),
      agentId: agent.id,
      agentName: agent.name,
      type: 'completed',
      message: `${agent.name} finalizó la respuesta.`,
    });

    return {
      reply: responseText,
      logs,
    };
  }

  // 2. CASO AGENTE MANAGER: Evalúa si debe responder o delegar a uno de sus subordinados a cargo
  const subordinates = availableAgents.filter(a => agent.subordinateIds?.includes(a.id));

  logs.push({
    id: `log-${Date.now()}-1`,
    timestamp: now(),
    agentId: agent.id,
    agentName: agent.name,
    type: 'manager_analysis',
    message: `${agent.name} (Manager) está evaluando el requerimiento y subordinados a cargo: [${subordinates.map(s => s.name).join(', ')}].`,
  });

  const managerPrompt = `Eres ${agent.name}, Manager y Orquestador.
Tu perfil del sistema:
${agent.systemPrompt}
${pluginsText}

Tienes los siguientes especialistas a tu cargo:
${subordinates.map(s => `- ID: "${s.id}" | Nombre: "${s.name}" | Especialidad/Descripción: "${s.description}" | Proveedor: "${s.provider.toUpperCase()}" | Modelo: "${s.model}"`).join('\n')}

Historial reciente:
${chatHistory.slice(-4).map(h => `${h.role}: ${h.content}`).join('\n')}

Petición del usuario:
"${userMessage}"

INSTRUCCIONES CRÍTICAS:
Debes decidir:
Opción A: Si es una pregunta estratégica, de gestión, saludo o algo que tú debes responder directamente como Manager.
Opción B: Si es un requerimiento técnico o de ejecución que debe realizar uno de tus especialistas a cargo.

Responde ÚNICAMENTE en formato JSON válido con la siguiente estructura (sin bloques de código markdown extras):
{
  "decision": "direct" | "delegate",
  "managerNotes": "Breve explicación de tu análisis",
  "delegateTo": "ID_DEL_ESPECIALISTA_O_NULL",
  "subTask": "Instrucción clara y desglosada para el especialista",
  "directResponse": "Tu respuesta directa en caso de no delegar"
}`;

  let managerRaw = '';
  try {
    managerRaw = await callAIProvider(agent, managerPrompt, apiKeys);
  } catch {
    throw new Error('PROVIDER_EXECUTION_FAILED');
  }

  // Limpiar posible formato markdown en el JSON
  const cleanedJson = managerRaw.replace(/```json/g, '').replace(/```/g, '').trim();
  let decisionObj: any = {};
  try {
    decisionObj = JSON.parse(cleanedJson);
  } catch (e) {
    decisionObj = { decision: 'direct', directResponse: managerRaw };
  }

  // Si el Manager decide responder directamente
  if (decisionObj.decision !== 'delegate' || !decisionObj.delegateTo) {
    logs.push({
      id: `log-${Date.now()}-2`,
      timestamp: now(),
      agentId: agent.id,
      agentName: agent.name,
      type: 'completed',
      message: `${agent.name} resolvió la consulta directamente como Manager.`,
    });

    return {
      reply: decisionObj.directResponse || decisionObj.managerNotes || managerRaw,
      logs,
    };
  }

  // Si el Manager decide delegar a un subordinado
  const specialist = subordinates.find(s => s.id === decisionObj.delegateTo) || subordinates[0];
  const specialistPluginsText = formatPluginsContext(specialist);

  logs.push({
    id: `log-${Date.now()}-2`,
    timestamp: now(),
    agentId: agent.id,
    agentName: agent.name,
    type: 'delegated',
    message: `${agent.name} derivó la tarea al especialista ${specialist.name} (${specialist.provider.toUpperCase()}).`,
    details: decisionObj.managerNotes || `Subtarea: ${decisionObj.subTask}`,
    targetAgentId: specialist.id,
    targetAgentName: specialist.name,
  });

  logs.push({
    id: `log-${Date.now()}-3`,
    timestamp: now(),
    agentId: specialist.id,
    agentName: specialist.name,
    type: 'agent_executing',
    message: `${specialist.name} está ejecutando la tarea con modelo ${specialist.model}.`,
  });

  // Ejecución del Especialista
  const specialistPrompt = `Eres ${specialist.name}.
${specialist.systemPrompt}
${specialistPluginsText}

Tu Manager (${agent.name}) te ha encomendado la siguiente tarea derivada:
"${decisionObj.subTask || userMessage}"

Contexto original del usuario:
"${userMessage}"

Por favor desarrolla tu entrega técnica con excelencia.`;

  let specialistOutput = '';
  try {
    specialistOutput = await callAIProvider(specialist, specialistPrompt, apiKeys);
  } catch {
    throw new Error('PROVIDER_EXECUTION_FAILED');
  }

  logs.push({
    id: `log-${Date.now()}-4`,
    timestamp: now(),
    agentId: specialist.id,
    agentName: specialist.name,
    type: 'completed',
    message: `${specialist.name} completó la entrega y la devolvió al manager.`,
  });

  const finalReply = `🧠 **${agent.name} (Manager)**:
> "${decisionObj.managerNotes || 'He analizado tu solicitud y derivado la ejecución al especialista correspondiente.'}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 **Entregable de ${specialist.name} [${specialist.provider.toUpperCase()} - ${specialist.model}]**:
${specialistOutput}`;

  return {
    reply: finalReply,
    delegation: {
      assignedToAgentId: specialist.id,
      assignedToAgentName: specialist.name,
      taskSummary: decisionObj.subTask || userMessage,
      specialistResult: specialistOutput,
    },
    logs,
  };
}
