import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { AgentActivityLog } from '@/types';

const eventTypes: AgentActivityLog['type'][] = ['telegram_in', 'manager_analysis', 'delegated', 'agent_executing', 'completed', 'error'];

function toLog(row: Record<string, any>): AgentActivityLog {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  return {
    id: row.id,
    timestamp: row.created_at,
    agentId: row.agent_id || undefined,
    agentName: details.agentName,
    type: row.event_type,
    message: row.message,
    details: typeof details.text === 'string' ? details.text : undefined,
    targetAgentId: details.targetAgentId,
    targetAgentName: details.targetAgentName,
  };
}

export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const { data, error } = await client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return NextResponse.json({ error: 'No se pudo cargar la actividad.' }, { status: 500 });
    return NextResponse.json({ logs: (data || []).map(toLog) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    if (!eventTypes.includes(body.type) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) {
      return NextResponse.json({ error: 'Evento de actividad inválido.' }, { status: 400 });
    }

    const { data, error } = await client.from('activity_logs').insert({
      user_id: user.id,
      agent_id: typeof body.agentId === 'string' ? body.agentId : null,
      event_type: body.type,
      message: body.message.trim(),
      details: {
        text: typeof body.details === 'string' ? body.details : undefined,
        agentName: typeof body.agentName === 'string' ? body.agentName : undefined,
        targetAgentId: typeof body.targetAgentId === 'string' ? body.targetAgentId : undefined,
        targetAgentName: typeof body.targetAgentName === 'string' ? body.targetAgentName : undefined,
      },
    }).select().single();

    if (error || !data) return NextResponse.json({ error: 'No se pudo guardar el evento.' }, { status: 403 });
    return NextResponse.json({ log: toLog(data) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const { error } = await client.from('activity_logs').delete().eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'No se pudo limpiar la actividad.' }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}
