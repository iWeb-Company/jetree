import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const { data, error } = await client.from('departments').select('*').order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ departments: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'name es obligatorio' }, { status: 400 });
    const { data, error } = await client.from('departments').insert({
      name: body.name.trim(), description: body.description?.trim() || '', icon: body.icon || '🌳', created_by: user.id,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ department: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { client } = await requireUser(request);
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    const payload = Object.fromEntries(
      Object.entries(body)
        .filter(([key]) => ['name', 'description', 'icon'].includes(key))
        .map(([key, value]) => [key, key === 'name' || key === 'description' ? String(value || '').trim() : value])
    );
    if (payload.name !== undefined && !(payload.name as string)) return NextResponse.json({ error: 'name es obligatorio' }, { status: 400 });
    const { data, error } = await client.from('departments').update(payload).eq('id', body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ department: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { client } = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    const { error } = await client.from('departments').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message === 'AUTH_REQUIRED' ? 'Autenticación requerida' : 'Error interno' }, { status: error.message === 'AUTH_REQUIRED' ? 401 : 500 });
  }
}
