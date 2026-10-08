import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { exportVisibleData } from '@/lib/server/data-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const result = await exportVisibleData(client, user.id);
    return NextResponse.json(result, { headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'attachment; filename="jetree-datos.json"',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'EXPORT_TOO_LARGE' ? 413 : 500;
    const message = status === 401 ? 'Iniciá sesión para exportar tus datos.' : status === 413
      ? 'La exportación supera el tamaño permitido. Solicitá una copia al administrador.'
      : 'No se pudo completar la exportación. No se descargó una copia parcial.';
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
