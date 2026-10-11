import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    let query = client.from('agents').select('*').order('created_at', { ascending: true });
    if (!includeArchived) {
      const { data: departments, error: departmentsError } = await client.from('departments')
        .select('id').is('deleted_at', null);
      if (departmentsError) return NextResponse.json({ error: 'No se pudieron cargar los departamentos.' }, { status: 500 });
      const departmentIds = (departments || []).map(department => department.id);
      if (departmentIds.length === 0) return NextResponse.json({ agents: [] });
      query = query.is('deleted_at', null).in('department_id', departmentIds);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data || [];
    if (rows.length === 0) return NextResponse.json({ agents: [] });
    const service = (await import('@/lib/server/auth')).getServiceSupabase();
    const { data: bots, error: botsError } = await service.from('telegram_bots')
      .select('agent_id,bot_username,is_active,updated_at').in('agent_id', rows.map(agent => agent.id));
    if (botsError) return NextResponse.json({ error: 'No se pudo cargar el estado de Telegram.' }, { status: 500 });
    const botByAgent = new Map((bots || []).map(bot => [bot.agent_id, bot]));
    return NextResponse.json({ agents: rows.map(agent => ({
      ...agent,
      telegram_bot: botByAgent.has(agent.id) ? {
        bot_username: botByAgent.get(agent.id)?.bot_username,
        is_active: botByAgent.get(agent.id)?.is_active,
        updated_at: botByAgent.get(agent.id)?.updated_at,
      } : null,
    })) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const allowed = ['department_id', 'name', 'description', 'role_type', 'provider', 'model', 'system_prompt', 'subordinate_ids', 'enabled_tool_ids', 'avatar'];
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    if (!payload.department_id || typeof payload.name !== 'string' || !payload.name.trim() || !payload.provider || typeof payload.model !== 'string' || !payload.model.trim()) {
      return NextResponse.json({ error: 'department_id, name, provider y model son obligatorios' }, { status: 400 });
    }
    if (!['openai', 'gemini', 'claude', 'custom', 'deepseek', 'groq'].includes(String(payload.provider))) {
      return NextResponse.json({ error: 'Proveedor no soportado.' }, { status: 400 });
    }
    const { data, error } = await client.from('agents').insert({ ...payload, created_by: user.id }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { client } = await requireUser(request);
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    if (body.action === 'restore') {
      const { data, error } = await client.from('agents').update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('id', body.id).select().maybeSingle();
      if (error) return NextResponse.json({ error: 'No se pudo restaurar el agente.' }, { status: 400 });
      if (!data) return NextResponse.json({ error: 'Agente no encontrado o sin permisos.' }, { status: 404 });
      return NextResponse.json({ agent: data });
    }
    const allowed = ['department_id', 'name', 'description', 'role_type', 'provider', 'model', 'system_prompt', 'subordinate_ids', 'enabled_tool_ids', 'avatar', 'status'];
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    delete (payload as any).id;
    const { data, error } = await client.from('agents').update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', body.id).select().maybeSingle();
    if (!error && !data) return NextResponse.json({ error: 'Agente no encontrado o no editable por este usuario.' }, { status: 404 });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ agent: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { client } = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    const { data, error } = await client.from('agents').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).select('id').maybeSingle();
    if (!error && !data) return NextResponse.json({ error: 'Agente no encontrado o no eliminable por este usuario.' }, { status: 404 });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}
