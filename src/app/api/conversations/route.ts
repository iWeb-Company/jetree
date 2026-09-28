import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const { client } = await requireUser(request);
    const agentId = new URL(request.url).searchParams.get('agentId');
    if (!agentId || agentId.length > 80) return NextResponse.json({ error: 'agentId inválido.' }, { status: 400 });

    const { data: conversation, error: conversationError } = await client
      .from('conversations')
      .select('id, title, updated_at')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversationError) return NextResponse.json({ error: 'No se pudo cargar la conversación compartida.' }, { status: 500 });
    if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

    const { data: rows, error: messagesError } = await client
      .from('messages')
      .select('id, role, content, delegation, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (messagesError) return NextResponse.json({ error: 'No se pudo cargar el historial compartido.' }, { status: 500 });

    const messages = (rows || []).reverse().map(row => ({
      id: row.id,
      agentId,
      role: row.role,
      content: row.content,
      timestamp: row.created_at,
      delegation: row.delegation,
    }));

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
    return NextResponse.json({ error: 'No se pudo cargar el historial.' }, { status: 500 });
  }
}
