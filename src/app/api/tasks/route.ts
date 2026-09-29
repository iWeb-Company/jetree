import { NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/server/auth';

const statuses = ['pending', 'in_progress', 'completed', 'failed'] as const;

export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const { data, error } = await client
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: 'No se pudieron cargar las tareas.' }, { status: 500 });
    const { data: departments, error: departmentsError } = await client.from('departments').select('id').is('deleted_at', null);
    if (departmentsError) return NextResponse.json({ error: 'No se pudieron cargar los departamentos.' }, { status: 500 });
    const activeIds = new Set((departments || []).map(department => department.id));
    return NextResponse.json({ tasks: (data || []).filter(task => !task.department_id || activeIds.has(task.department_id)) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200 || typeof body.description !== 'string' || body.description.length > 12000) {
      return NextResponse.json({ error: 'Título o descripción inválidos.' }, { status: 400 });
    }

    const payload = {
      title,
      description: body.description,
      department_id: typeof body.departmentId === 'string' ? body.departmentId : null,
      assigned_agent_id: typeof body.assignedAgentId === 'string' ? body.assignedAgentId : null,
      source_channel: ['web', 'telegram', 'api'].includes(body.sourceChannel) ? body.sourceChannel : 'web',
      created_by: user.id,
    };
    const { data, error } = await client.from('tasks').insert(payload).select().single();
    if (error || !data) return NextResponse.json({ error: 'No se pudo crear la tarea en un departamento accesible.' }, { status: 403 });
    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { client } = await requireUser(request);
    const body = await request.json();
    if (typeof body.id !== 'string' || !statuses.includes(body.status)) {
      return NextResponse.json({ error: 'Tarea o estado inválidos.' }, { status: 400 });
    }

    const { data, error } = await client.from('tasks')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo actualizar la tarea.' }, { status: 403 });
    if (!data) return NextResponse.json({ error: 'Tarea no encontrada o sin permisos.' }, { status: 404 });
    if (body.status === 'pending' && data.source_channel === 'telegram' && data.status === 'pending') {
      const service = getServiceSupabase();
      const { data: failedUpdates, error: lookupError } = await service.from('telegram_updates').select('id,response_text')
        .eq('task_id', data.id).eq('status', 'failed');
      if (lookupError) return NextResponse.json({ error: 'No se pudo reencolar la tarea.' }, { status: 500 });
      for (const update of failedUpdates || []) {
        const { error: retryError } = await service.from('telegram_updates').update({
          status: update.response_text ? 'delivery_pending' : 'pending', attempts: 0,
          next_attempt_at: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', update.id);
        if (retryError) return NextResponse.json({ error: 'No se pudo reencolar la tarea.' }, { status: 500 });
      }
      const { data: refreshed } = await client.from('tasks').update({ retry_count: 0, last_error: null, updated_at: new Date().toISOString() }).eq('id', data.id).select('*').single();
      return NextResponse.json({ task: refreshed || data });
    }
    return NextResponse.json({ task: data });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'Autenticación requerida.' : 'Error interno.' }, { status: code === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}
