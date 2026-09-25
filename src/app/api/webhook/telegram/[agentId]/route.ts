import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeAgentChat } from '@/lib/agents/orchestrator';
import { INITIAL_AGENTS } from '@/lib/agents/initialData';
import { Agent } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(
  req: Request,
  { params }: { params: { agentId: string } }
) {
  try {
    const { agentId } = params;
    const body = await req.json();

    // Validar mensaje entrante de Telegram
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ status: 'No message text found' }, { status: 200 });
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();
    const fromUser = message.from?.username || message.from?.first_name || 'Usuario';

    // Obtener configuración del agente: desde localStorage/Supabase o agentes iniciales
    // Intentar buscar el agente en memoria inicial o fallback
    let targetAgent: Agent | undefined = INITIAL_AGENTS.find(a => a.id === agentId);

    // Si no está en iniciales, crear un mock basado en el ID
    if (!targetAgent) {
      targetAgent = {
        id: agentId,
        name: `Agente Telegram (${agentId})`,
        description: 'Agente conectado por Telegram BotFather',
        departmentId: 'ai-dev',
        roleType: 'independent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: 'Eres un asistente inteligente conectado a Jetree.',
        status: 'idle',
      };
    }

    const botToken = targetAgent.telegramBot?.botToken || process.env.TELEGRAM_BOT_TOKEN;

    // Comando de bienvenida /start
    if (userText === '/start') {
      const welcomeText = targetAgent.roleType === 'manager'
        ? `👑 ¡Hola ${fromUser}! Soy *${targetAgent.name}*, Manager y Orquestador en Jetree.\n\nEscríbeme cualquier requerimiento, objetivo o consulta estratégica. Coordinaré las soluciones y derivaré tareas a los especialistas de mi departamento.`
        : `⚡ ¡Hola ${fromUser}! Soy *${targetAgent.name}*, agente especialista en Jetree.\n\nEscríbeme tu consulta o requerimiento técnico y te responderé directamente.`;

      await sendTelegram(chatId, welcomeText, botToken);
      return NextResponse.json({ status: 'Welcome sent' }, { status: 200 });
    }

    // Registrar tarea en Supabase
    const { error: dbError } = await supabase
      .from('tasks')
      .insert([
        {
          title: userText.slice(0, 80),
          description: `Mensaje directo de @${fromUser} a ${targetAgent.name} vía Telegram.\n\n"${userText}"`,
          status: 'in_progress',
        },
      ]);

    if (dbError) {
      console.warn('Error guardando tarea en Supabase:', dbError);
    }

    // Notificar al usuario que el agente está analizando/escribiendo
    await sendChatAction(chatId, 'typing', botToken);

    // Procesar la respuesta a través del orquestador del agente
    const result = await executeAgentChat(
      targetAgent,
      userText,
      INITIAL_AGENTS,
      []
    );

    // Formatear respuesta de vuelta a Telegram
    let telegramReply = result.reply;
    if (result.delegation) {
      telegramReply = `🧠 *${targetAgent.name} (Manager)*:\n> _He derivado tu requerimiento a *${result.delegation.assignedToAgentName}*._\n\n📌 *Entregable del Especialista*:\n${result.delegation.specialistResult}`;
    }

    await sendTelegram(chatId, telegramReply, botToken);

    return NextResponse.json({ status: 'Processed successfully' }, { status: 200 });
  } catch (err: any) {
    console.error('Error en webhook de agente Telegram:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Envío de mensaje a Telegram
async function sendTelegram(chatId: number, text: string, token?: string) {
  const activeToken = token || process.env.TELEGRAM_BOT_TOKEN;
  if (!activeToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (e) {
    console.error('Error enviando mensaje a Telegram:', e);
  }
}

// Enviar acción 'typing' a Telegram
async function sendChatAction(chatId: number, action: string, token?: string) {
  const activeToken = token || process.env.TELEGRAM_BOT_TOKEN;
  if (!activeToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${activeToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: action,
      }),
    });
  } catch (e) {
    // Silencioso
  }
}
