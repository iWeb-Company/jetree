import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/security-policy';
import { retiredModelPath } from '@/lib/model-access';

export function middleware(request: NextRequest) {
  if (retiredModelPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: 'Jetree acepta únicamente conexiones de modelos por API.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  // Next.js reads the request CSP and attaches this nonce to its rendered scripts.
  headers.set('Content-Security-Policy', csp);
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon\\.png).*)', '/api/model-devices/:path*', '/api/mcp-oauth/:path*', '/api/mcp-connections/:path*'],
};
