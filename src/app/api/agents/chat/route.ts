import { NextResponse } from 'next/server';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import { requireUser } from '@/lib/server/auth';
import { getUserProviderApiKey } from '@/lib/server/provider-secrets';
import { Agent, AIProvider } from '@/types';

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

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const agentId = typeof body.agentId === 'string' ? body.agentId : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!agentId || !message || message.length > 8000) {
      return NextResponse.json({ error: 'Se requiere un agente y un mensaje de hasta 8.000 caracteres.' }, { status: 400 });
    }

    const { data: agentRow, error: agentError } = await client
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .maybeSingle();

    if (agentError) return NextResponse.json({ error: 'No se pudo cargar el agente.' }, { status: 500 });
    if (!agentRow) return NextResponse.json({ error: 'Agente no encontrado o sin permisos.' }, { status: 404 });
    if (!supportedProviders.includes(agentRow.provider as AIProvider)) {
      return NextResponse.json({ error: 'El proveedor de este agente no está soportado.' }, { status: 400 });
    }

    const { data: departmentRows, error: departmentError } = await client
      .from('agents')
      .select('*')
      .eq('department_id', agentRow.department_id);

    if (departmentError) return NextResponse.json({ error: 'No se pudieron cargar los agentes del departamento.' }, { status: 500 });

    const departmentAgents = (departmentRows || []).map(toAgent);
    const agent = toAgent(agentRow);
    const availableAgents = departmentAgents.filter(item => item.id !== agent.id || agent.roleType === 'manager');
    agent.subordinateIds = (agent.subordinateIds || []).filter(id => availableAgents.some(item => item.id === id));

    const providers = new Set<AIProvider>([agent.provider]);
    if (agent.roleType === 'manager') {
      for (const subordinate of availableAgents) {
        if (agent.subordinateIds.includes(subordinate.id)) providers.add(subordinate.provider);
      }
    }

    const apiKeys: Record<string, string> = {};
    for (const provider of providers) {
      const apiKey = await getUserProviderApiKey(user.id, provider);
      if (!apiKey) {
        return NextResponse.json(
          { error: `Configurá una conexión API propia para ${provider} antes de ejecutar este agente.`, provider },
          { status: 409 },
        );
      }
      apiKeys[provider] = apiKey;
    }

    const history = Array.isArray(body.chatHistory)
      ? body.chatHistory.slice(-12).flatMap((item: any) => {
        if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
        return [{ role: item.role as 'user' | 'assistant', content: item.content.slice(0, 6000) }];
      })
      : [];

    const result = await executeAgentChat(agent, message, availableAgents, history, apiKeys);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
    if (code === 'SERVER_CONFIGURATION_ERROR') {
      return NextResponse.json({ error: 'La bóveda de credenciales no está configurada en el servidor.' }, { status: 503 });
    }
    if (code === 'PROVIDER_CREDENTIAL_REQUIRED') {
      return NextResponse.json({ error: 'Falta una conexión API para el proveedor elegido.' }, { status: 409 });
    }
    if (code === 'PROVIDER_EXECUTION_FAILED') {
      return NextResponse.json({ error: 'El proveedor rechazó o no pudo completar la solicitud.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'No se pudo ejecutar el agente.' }, { status: 500 });
  }
}
