import { NextResponse } from 'next/server';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { getUserProviderApiKey } from '@/lib/server/provider-secrets';
import { AgentEngineError, providerErrorMessage } from '@/lib/agents/provider-adapter';
import { Agent, AIProvider } from '@/types';
import { executeAuthorizedTool } from '@/lib/server/agent-tools';
import { selectedModelSource } from '@/lib/model-device-contract';
import { personalDeviceProvider, requireOwnedModelDevice } from '@/lib/server/model-devices';

export const runtime = 'nodejs';

const supportedProviders: AIProvider[] = ['openai', 'gemini', 'claude', 'custom'];

function toAgent(row: Record<string, any>): Agent {
  const subordinateIds = Array.isArray(row.subordinate_ids) ? row.subordinate_ids as string[] : [];
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    departmentId: row.department_id,
    roleType: row.role_type,
    subordinateIds,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt || '',
    enabledPluginIds: Array.isArray(row.enabled_tool_ids) ? row.enabled_tool_ids : [],
    status: row.status || 'idle',
    avatar: row.avatar || undefined,
    createdAt: row.created_at,
  };
}

function responseForError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'MODEL_SOURCE_INVALID') return NextResponse.json({ error: 'Conexión del modelo inválida.' }, { status: 400 });
  if (code === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
  if (code === 'SERVER_CONFIGURATION_ERROR') {
    return NextResponse.json({ error: 'La bóveda de credenciales no está configurada en el servidor.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'No se pudo ejecutar el agente.' }, { status: 500 });
}

export async function POST(request: Request) {
  let executionService: ReturnType<typeof getServiceSupabase> | null = null;
  let executionId: string | null = null;
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const modelSource = selectedModelSource(body.modelSource);
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
    const agentId = typeof body.agentId === 'string' ? body.agentId : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!agentId || !message || message.length > 8000) {
      return NextResponse.json({ error: 'Se requiere un agente y un mensaje de hasta 8.000 caracteres.' }, { status: 400 });
    }

    const { data: agentRow, error: agentError } = await client
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (agentError) return NextResponse.json({ error: 'No se pudo cargar el agente.' }, { status: 500 });
    if (!agentRow) return NextResponse.json({ error: 'Agente no encontrado o sin permisos.' }, { status: 404 });
    const { data: activeDepartment, error: activeDepartmentError } = await client.from('departments')
      .select('id').eq('id', agentRow.department_id).is('deleted_at', null).maybeSingle();
    if (activeDepartmentError) return NextResponse.json({ error: 'No se pudo validar el departamento.' }, { status: 500 });
    if (!activeDepartment) return NextResponse.json({ error: 'El departamento de este agente está archivado.' }, { status: 404 });
    if (!supportedProviders.includes(agentRow.provider as AIProvider)) {
      return NextResponse.json({ error: 'El proveedor de este agente no está soportado.' }, { status: 400 });
    }

    const { data: departmentRows, error: departmentError } = await client
      .from('agents')
      .select('*')
      .eq('department_id', agentRow.department_id)
      .is('deleted_at', null);

    if (departmentError) return NextResponse.json({ error: 'No se pudieron cargar los agentes del departamento.' }, { status: 500 });

    const departmentAgents = (departmentRows || []).map(toAgent);
    const agent = toAgent(agentRow);
    const availableAgents = departmentAgents.filter(item => item.id !== agent.id || agent.roleType === 'manager');
    agent.subordinateIds = (agent.subordinateIds || []).filter(id =>
      availableAgents.some(item => item.id === id && item.roleType === 'independent'),
    );

    const providers = new Set<AIProvider>([agent.provider]);
    if (agent.roleType === 'manager') {
      for (const subordinate of availableAgents) {
        if (agent.subordinateIds.includes(subordinate.id)) providers.add(subordinate.provider);
      }
    }

    const apiKeys: Record<string, string> = {};
    if (modelSource === 'local') {
      if (agent.provider !== 'gemini') return NextResponse.json({ error: 'El conector personal de esta entrega admite Google. ChatGPT requiere acceso autorizado y Claude permanece por API con las condiciones actuales de Anthropic.' }, { status: 409 });
      if (!/^[a-f0-9-]{36}$/.test(deviceId)) return NextResponse.json({ error: 'Elegí tu conexión personal.' }, { status: 400 });
      await requireOwnedModelDevice(user.id, deviceId);
    }
    for (const provider of modelSource === 'api' ? providers : []) {
      const apiKey = await getUserProviderApiKey(user.id, provider);
      if (apiKey) apiKeys[provider] = apiKey;
    }
    if (modelSource === 'api' && !apiKeys[agent.provider]) {
      return NextResponse.json(
        { error: `Configurá una conexión API propia para ${agent.provider} antes de ejecutar este agente.`, provider: agent.provider },
        { status: 409 },
      );
    }
    const executableSubordinates = availableAgents.filter(item => modelSource === 'local' ? item.provider === 'gemini' : Boolean(apiKeys[item.provider]));
    agent.subordinateIds = (agent.subordinateIds || []).filter(id =>
      executableSubordinates.some(item => item.id === id && item.roleType === 'independent'),
    );

    let conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    if (conversationId) {
      const { data: conversation, error: conversationError } = await client
        .from('conversations')
        .select('id, agent_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (conversationError) return NextResponse.json({ error: 'No se pudo cargar la conversación compartida.' }, { status: 500 });
      if (!conversation || conversation.agent_id !== agent.id) {
        return NextResponse.json({ error: 'Conversación no encontrada o sin permisos.' }, { status: 404 });
      }
    } else {
      const { data: conversation, error: conversationError } = await client
        .from('conversations')
        .insert({
          department_id: agent.departmentId,
          agent_id: agent.id,
          created_by: user.id,
          title: message.slice(0, 120),
        })
        .select('id')
        .single();
      if (conversationError || !conversation) {
        return NextResponse.json({ error: 'No se pudo iniciar la conversación compartida.' }, { status: 403 });
      }
      conversationId = conversation.id;
    }

    const { data: priorMessages, error: historyError } = await client
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(12);
    if (historyError) return NextResponse.json({ error: 'No se pudo cargar el historial de conversación.' }, { status: 500 });

    const dailyLimit = Number(process.env.JETREE_WORKSPACE_DAILY_EXECUTION_LIMIT);
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1) {
      return NextResponse.json({ error: 'El límite diario de ejecuciones del workspace no está configurado.' }, { status: 503 });
    }

    const service = getServiceSupabase();
    const { data: withinQuota, error: quotaError } = await service.rpc('consume_workspace_execution_quota', { max_runs: dailyLimit });
    if (quotaError) return NextResponse.json({ error: 'No se pudo verificar el límite del workspace. Aplicá las migraciones requeridas.' }, { status: 503 });
    if (!withinQuota) return NextResponse.json({ error: 'Se alcanzó el límite diario de ejecuciones del workspace.' }, { status: 429 });

    const { data: execution, error: executionError } = await service.from('agent_executions').insert({
      user_id: user.id,
      department_id: agent.departmentId,
      agent_id: agent.id,
      conversation_id: conversationId,
      provider: agent.provider,
      model: modelSource === 'local' ? 'gemini-cli-account-default' : agent.model,
      status: 'running',
      input_chars: message.length,
    }).select('id').single();
    if (executionError || !execution) {
      return NextResponse.json({ error: 'No se pudo registrar la ejecución.' }, { status: 500 });
    }
    executionService = service;
    executionId = execution.id;

    const { error: userMessageError } = await client.from('messages').insert({
      conversation_id: conversationId,
      author_user_id: user.id,
      execution_id: executionId,
      role: 'user',
      content: message,
    });
    if (userMessageError) throw new AgentEngineError('PERSISTENCE_FAILED');

    const history = (priorMessages || []).reverse().flatMap(item => {
      if (!['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
      return [{ role: item.role as 'user' | 'assistant', content: item.content.slice(0, 6000) }];
    });

    const result = await executeAgentChat(agent, message, availableAgents, history, apiKeys,
      modelSource === 'local' ? personalDeviceProvider(user.id, deviceId, request.signal) : undefined, async delegation => {
      const { error } = await service.from('agent_executions').update({ delegation }).eq('id', executionId);
      if (error) throw new AgentEngineError('PERSISTENCE_FAILED');
    }, (executingAgent, toolId, operation, input) => executeAuthorizedTool(client, user.id, executingAgent.id, toolId, operation, input, undefined, conversationId));
    const { error: assistantMessageError } = await service.from('messages').insert({
      conversation_id: conversationId,
      execution_id: executionId,
      role: 'assistant',
      content: result.reply,
      delegation: result.delegation || null,
    });
    if (assistantMessageError) throw new AgentEngineError('PERSISTENCE_FAILED');
    const { error: completionError } = await service.from('agent_executions').update({
      status: 'completed',
      output_chars: result.reply.length,
      delegation: result.delegation || null,
      finished_at: new Date().toISOString(),
    }).eq('id', executionId);
    if (completionError) throw new AgentEngineError('PERSISTENCE_FAILED');
    await service.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

    return NextResponse.json({ ...result, conversationId });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (executionService && executionId) {
      const knownCodes = [
        'MODEL_DEVICE_OFFLINE', 'MODEL_DEVICE_UNAVAILABLE', 'MODEL_DEVICE_PROVIDER_UNSUPPORTED',
        'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PROVIDER_CREDENTIAL_REQUIRED',
        'PROVIDER_EXECUTION_FAILED', 'MANAGER_DECISION_INVALID', 'DELEGATION_TARGET_NOT_ALLOWED',
        'AGENT_CONTEXT_TOO_LARGE', 'EMPTY_PROVIDER_RESPONSE', 'PERSISTENCE_FAILED',
      ];
      const safeCode = error instanceof AgentEngineError && knownCodes.includes(code)
        ? code
        : code === 'MANAGER_DECISION_INVALID' || code === 'DELEGATION_TARGET_NOT_ALLOWED'
          ? code
          : 'EXECUTION_FAILED';
      await executionService.from('agent_executions').update({
        status: 'failed',
        error_code: safeCode,
        finished_at: new Date().toISOString(),
      }).eq('id', executionId);
    }
    if (code === 'PROVIDER_CREDENTIAL_REQUIRED') {
      return NextResponse.json({ error: 'Falta una conexión API para el proveedor elegido.' }, { status: 409 });
    }
    if (error instanceof AgentEngineError) {
      const status = code === 'PROVIDER_CREDENTIAL_REQUIRED' ? 409 : code === 'AGENT_CONTEXT_TOO_LARGE' ? 413 : code === 'PERSISTENCE_FAILED' ? 500 : 502;
      return NextResponse.json({ error: providerErrorMessage(code), code }, { status });
    }
    if (code === 'MANAGER_DECISION_INVALID' || code === 'DELEGATION_TARGET_NOT_ALLOWED') {
      return NextResponse.json({ error: providerErrorMessage(code), code }, { status: 502 });
    }
    return responseForError(error);
  }
}
