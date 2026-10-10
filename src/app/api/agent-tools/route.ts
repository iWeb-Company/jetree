import { toolErrorMessage } from '@/lib/tool-feedback';
import { NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/server/auth';
import { executeAuthorizedTool } from '@/lib/server/agent-tools';
import { getGithubConnectionAccess } from '@/lib/server/tool-connections';

export const runtime = 'nodejs';

function statusFor(code: string) {
  if (code === 'AUTH_REQUIRED') return 401;
  if (code === 'TOOL_AGENT_ACCESS_DENIED' || code === 'TOOL_NOT_AUTHORIZED') return 403;
  if (code === 'TOOL_GITHUB_PRIVATE_ACCESS_REQUIRED') return 403;
  if (code === 'TOOL_CONNECTION_REQUIRED' || code === 'TOOL_CONNECTION_EXPIRED') return 409;
  if (code === 'TOOL_INPUT_INVALID' || code === 'TOOL_NOT_SUPPORTED') return 400;
  if (code === 'TOOL_APPROVAL_NOT_PENDING') return 409;
  if (code === 'SERVER_CONFIGURATION_ERROR' || code === 'TOOL_SEARCH_NOT_CONFIGURED') return 503;
  if (code.startsWith('TOOL_PROVIDER_') || code === 'TOOL_OPERATION_FAILED' || code === 'TOOL_FILE_TYPE_UNSUPPORTED') return 502;
  return 500;
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    if (JSON.stringify(body).length > 20_000 || !body || typeof body !== 'object') return NextResponse.json({ error: 'Solicitud inválida o demasiado grande.' }, { status: 413 });
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    if (conversationId) {
      const { data: conversation, error } = await client.from('conversations').select('id, agent_id')
        .eq('id', conversationId).eq('agent_id', body.agentId).maybeSingle();
      if (error || !conversation) return NextResponse.json({ error: 'La conversación no pertenece a este agente o no tenés acceso.' }, { status: 403 });
    }
    const result = await executeAuthorizedTool(client, user.id, body.agentId, body.toolId, body.operation, body.input, undefined, conversationId);
    return NextResponse.json(result, { status: 'pendingApproval' in result ? 202 : 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TOOL_OPERATION_FAILED';
    return NextResponse.json({ error: toolErrorMessage(code), code }, { status: statusFor(code) });
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const service = getServiceSupabase();
    const [connections, approvals, calls] = await Promise.all([
      service.from('tool_connections').select('provider, status, scopes, expires_at, account_label, connected_at, updated_at').eq('user_id', user.id),
      service.from('agent_tool_approvals').select('id, agent_id, conversation_id, tool_id, provider, operation, input, status, created_at').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
      service.from('agent_tool_calls').select('id, agent_id, provider, tool_id, operation, status, error_code, result_summary, cost_microunits, started_at, finished_at').eq('user_id', user.id).order('started_at', { ascending: false }).limit(100),
    ]);
    if (connections.error || approvals.error || calls.error) return NextResponse.json({ error: 'No se pudo cargar el estado de herramientas.' }, { status: 500 });
    const github = connections.data?.find(item => item.provider === 'github' && item.status === 'connected');
    const githubAccess = github ? await getGithubConnectionAccess(user.id) : 'public';
    return NextResponse.json({ searchReady: Boolean(process.env.TAVILY_API_KEY), connections: (connections.data || []).map(item => item.provider === 'github' ? { ...item, githubAccess } : item), pendingApprovals: approvals.data || [], calls: calls.data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
  }
}
