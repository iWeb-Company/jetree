import { NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/server/auth';
import { UUID } from '@/lib/mcp-contract';
import { mcpJsonHeaders } from '@/lib/server/mcp-auth';
export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    const { data, error } = await getServiceSupabase().from('mcp_grants').select('id,scopes,agent_ids,created_at,expires_at').eq('user_id', user.id).is('revoked_at', null).gt('expires_at', new Date().toISOString());
    if (error) throw error; return NextResponse.json({ connections: data }, { headers: mcpJsonHeaders });
  } catch (error) { return NextResponse.json({ error: 'No se pudieron cargar las conexiones.' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 503, headers: mcpJsonHeaders }); }
}
export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser(request); const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID.test(id)) return new Response(null, { status: 400 });
    const { error } = await getServiceSupabase().from('mcp_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
    if (error) throw error; return NextResponse.json({ ok: true }, { headers: mcpJsonHeaders });
  } catch (error) { return NextResponse.json({ error: 'No se pudo revocar la conexión.' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 503, headers: mcpJsonHeaders }); }
}
