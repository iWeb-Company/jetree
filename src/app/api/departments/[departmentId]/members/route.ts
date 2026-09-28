import { NextResponse } from 'next/server';
import { getServiceSupabase, requireWorkspaceAdmin } from '@/lib/server/auth';

type Context = { params: { departmentId: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    await requireWorkspaceAdmin(request);
    const service = getServiceSupabase();
    const { data: department, error: departmentError } = await service
      .from('departments').select('id').eq('id', params.departmentId).maybeSingle();
    if (departmentError) return NextResponse.json({ error: 'No se pudo consultar el departamento.' }, { status: 500 });
    if (!department) return NextResponse.json({ error: 'Departamento no encontrado.' }, { status: 404 });

    const { data: links, error: linksError } = await service
      .from('department_members').select('user_id, created_at').eq('department_id', params.departmentId);
    if (linksError) return NextResponse.json({ error: 'No se pudieron cargar las membresías.' }, { status: 500 });
    const userIds = (links || []).map(link => link.user_id);
    if (!userIds.length) return NextResponse.json({ members: [] });

    const { data: profiles, error: profilesError } = await service
      .from('profiles').select('id, email, role').in('id', userIds).order('email');
    if (profilesError) return NextResponse.json({ error: 'No se pudieron cargar los perfiles.' }, { status: 500 });
    const createdAtById = new Map((links || []).map(link => [link.user_id, link.created_at]));
    return NextResponse.json({ members: (profiles || []).map(profile => ({
      ...profile,
      created_at: createdAtById.get(profile.id),
    })) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'ADMIN_REQUIRED' ? 403 : 500;
    return NextResponse.json({ error: status === 401 ? 'Autenticación requerida.' : status === 403 ? 'Se requiere rol administrador.' : 'Error interno.' }, { status });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    await requireWorkspaceAdmin(request);
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 320 || !email.includes('@')) {
      return NextResponse.json({ error: 'Ingresá un email válido.' }, { status: 400 });
    }

    const service = getServiceSupabase();
    const { data: profile, error: profileError } = await service
      .from('profiles').select('id').eq('email', email).maybeSingle();
    if (profileError) return NextResponse.json({ error: 'No se pudo consultar el usuario.' }, { status: 500 });
    if (!profile) return NextResponse.json({ error: 'El usuario debe crear su cuenta en Jetree antes de asignarlo.' }, { status: 404 });

    const { error } = await service.from('department_members').upsert({
      department_id: params.departmentId,
      user_id: profile.id,
    }, { onConflict: 'department_id,user_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: 'No se pudo agregar al departamento.' }, { status: 400 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'ADMIN_REQUIRED' ? 403 : code === 'SERVER_CONFIGURATION_ERROR' ? 503 : 500;
    return NextResponse.json({ error: status === 401 ? 'Autenticación requerida.' : status === 403 ? 'Se requiere rol administrador.' : 'No se pudo procesar la membresía.' }, { status });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    await requireWorkspaceAdmin(request);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId es obligatorio.' }, { status: 400 });
    const service = getServiceSupabase();
    const { error } = await service.from('department_members')
      .delete().eq('department_id', params.departmentId).eq('user_id', userId);
    if (error) return NextResponse.json({ error: 'No se pudo quitar al usuario del departamento.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'ADMIN_REQUIRED' ? 403 : code === 'SERVER_CONFIGURATION_ERROR' ? 503 : 500;
    return NextResponse.json({ error: status === 401 ? 'Autenticación requerida.' : status === 403 ? 'Se requiere rol administrador.' : 'No se pudo procesar la membresía.' }, { status });
  }
}
