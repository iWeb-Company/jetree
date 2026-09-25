import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase para el backend (usando service_role si está disponible o el cliente anónimo)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validar si el mensaje viene de Telegram
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ status: 'No message text found' }, { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Comando básico de inicio o bienvenida
    if (text === '/start') {
      await sendTelegramMessage(chatId, '🌳 ¡Hola! Bienvenido a Jetree Node System. Escribe cualquier instrucción o tarea y la registraré automáticamente en el panel corporativo.');
      return NextResponse.json({ status: 'Success' }, { status: 200 });
    }

    // Procesar el texto como una nueva tarea para el sistema
    // Dividimos el texto: la primera línea como título, el resto como descripción si la hay
    const lines = text.split('\n');
    const title = lines[0] || 'Nueva tarea desde Telegram';
    const description = lines.slice(1).join('\n') || `Enviado por @${message.from?.username || 'usuario_iweb'} en Telegram`;

    // Insertar en la tabla tasks de Supabase
    const { error: dbError } = await supabase
      .from('tasks')
      .insert([
        {
          title,
          description,
          status: 'pending',
        },
      ]);

    if (dbError) {
      console.error('Error al guardar en Supabase:', dbError);
      await sendTelegramMessage(chatId, '❌ Hubo un error al registrar la tarea en la base de datos de Supabase.');
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Responder confirmando a Telegram
    await sendTelegramMessage(chatId, `✅ ¡Tarea registrada con éxito en Jetree!\n\n📌 *${title}*`);

    return NextResponse.json({ status: 'Task created successfully' }, { status: 200 });
  } catch (err: any) {
    console.error('Error en el webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Función auxiliar para enviar respuestas de vuelta a Telegram
async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });
}