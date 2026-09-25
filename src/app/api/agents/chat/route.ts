import { NextResponse } from 'next/server';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import { Agent } from '@/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agent, message, availableAgents, chatHistory } = body;

    if (!agent || !message) {
      return NextResponse.json(
        { error: 'Parámetros inválidos: se requiere agent y message.' },
        { status: 400 }
      );
    }

    const result = await executeAgentChat(
      agent as Agent,
      message,
      (availableAgents || []) as Agent[],
      chatHistory || []
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error en API /api/agents/chat:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno al procesar el mensaje con el agente' },
      { status: 500 }
    );
  }
}
