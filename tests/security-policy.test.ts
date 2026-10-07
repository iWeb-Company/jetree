import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy } from '../src/lib/security-policy';

test('production permits only the configured Auth/Realtime origin and nonced scripts', () => {
  const csp = contentSecurityPolicy('YWJjZA==', 'https://example.supabase.co/path');
  assert.match(csp, /connect-src 'self' https:\/\/example.supabase.co wss:\/\/example.supabase.co;/);
  assert.match(csp, /script-src 'self' 'nonce-YWJjZA==' 'strict-dynamic';/);
  assert.ok(!csp.includes('unsafe-eval'));
  assert.match(csp, /object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'/);
});

test('rejects injected nonce and unsafe production origins', () => {
  assert.throws(() => contentSecurityPolicy("bad'; script-src *", ''), /INVALID_CSP_NONCE/);
  assert.throws(() => contentSecurityPolicy('abcd', 'http://example.com'), /INVALID_SUPABASE_ORIGIN/);
});

test('disposable CI Auth can use loopback without permitting eval in a production build', () => {
  const csp = contentSecurityPolicy('abcd', 'http://127.0.0.1:54321');
  assert.match(csp, /connect-src 'self' http:\/\/127.0.0.1:54321 ws:\/\/127.0.0.1:54321;/);
  assert.ok(!csp.includes('unsafe-eval'));
});

test('development supports local Auth and hot reload without weakening production', () => {
  const csp = contentSecurityPolicy('abcd', 'http://127.0.0.1:54321', true);
  assert.match(csp, /ws:\/\/127.0.0.1:54321/);
  assert.match(csp, /'unsafe-eval'/);
});
