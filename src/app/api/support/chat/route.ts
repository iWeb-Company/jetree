import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { answerSupport, SupportLimiter, validateSupportMessages } from '@/lib/server/support-chat';

export const runtime = 'nodejs';
const limiter = new SupportLimiter();
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  let release: (() => void) | null = null;
  try {
    const { user } = await requireUser(request);
    const body = await readBoundedJson(request, 16000);
    const messages = validateSupportMessages(body.messages);
    release = limiter.acquire(user.id);
    if (!release) return NextResponse.json({ error: 'La ayuda alcanzó su límite temporal. Esperá un minuto o consultá al administrador si continúa.', code: 'SUPPORT_LIMIT' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    return NextResponse.json(await answerSupport(messages, fetch, request.signal), { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTH_REQUIRED' ? 401 : error instanceof SyntaxError || ['INVALID_MESSAGES', 'BODY_TOO_LARGE', 'BODY_INVALID'].includes(code) ? 400 : code === 'SUPPORT_QUOTA' ? 429 : code === 'SUPPORT_TIMEOUT' ? 504 : 503;
    const message = status === 401 ? 'Iniciá sesión para usar la ayuda.' : status === 400 ? 'El mensaje es demasiado largo o inválido. Probá una pregunta más breve.' : status === 429 ? 'El proveedor gratuito alcanzó su cuota. Intentá más tarde; no se cambió a un modelo pago.' : status === 504 ? 'La ayuda tardó demasiado. Podés intentar de nuevo o consultar al administrador.' : 'La ayuda con IA no está disponible. Consultá las guías de Jetree o avisá al administrador.';
    return NextResponse.json({ error: message, code: 'SUPPORT_ERROR' }, { status, headers });
  } finally { release?.(); }
}
