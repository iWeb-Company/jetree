export function contentSecurityPolicy(nonce: string, supabaseUrl: string, development = false) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error('INVALID_CSP_NONCE');
  const connections = ["'self'"];
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    const localAuth = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localAuth) {
      throw new Error('INVALID_SUPABASE_ORIGIN');
    }
    connections.push(url.origin, `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
  }
  if (development) connections.push('ws://localhost:*', 'ws://127.0.0.1:*');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connections.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
