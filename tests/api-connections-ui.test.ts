import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

test('model connections progressively accept first, second and third keys, retain failures and select repeated providers', async () => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic';
  const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const { supabase } = await import('../src/lib/supabase');
  const { default: Modal } = await import('../src/components/ApiConnectionsModal');
  const originalFetch = globalThis.fetch;
  const originalSession = supabase.auth.getSession;
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'synthetic' } }, error: null }) as any;
  const connections: any[] = []; const changes: any[] = [];
  globalThis.fetch = async (input, options) => {
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer synthetic');
    if (!options?.method || options.method === 'GET') return Response.json({ connections });
    const body = JSON.parse(String(options.body));
    if (body.action === 'select') { connections.forEach(c => { c.metadata.is_default = c.id === body.connectionId; }); return Response.json({ ok: true }); }
    if (body.apiKey === 'invalid') return Response.json({ error: 'Clave inválida.' }, { status: 422 });
    assert.equal(body.provider, undefined, 'Provider is detected by the server');
    const c = { id: `0000000${connections.length + 1}-0000-4000-8000-000000000001`, provider: 'gemini', status: 'connected', metadata: { is_default: connections.length === 0 } };
    connections.push(c); return Response.json({ connection: c });
  };
  try {
    const view = render(React.createElement(Modal, { isOpen: true, onClose() {}, userEmail: 'test@example.invalid', subscriptions: [], onConnectionChange: (...args: any[]) => changes.push(args) }));
    const field = () => view.getByLabelText('Clave API', { exact: true }) as HTMLInputElement;
    await waitFor(() => assert.equal(field().type, 'password'));
    assert.equal(view.queryByText('Agregar otra clave API'), null);
    fireEvent.change(field(), { target: { value: 'invalid' } });
    fireEvent.click(view.getByText('Conectar clave API'));
    await view.findByText('Clave inválida.');
    assert.equal(connections.length, 0); assert.equal(field().value, 'invalid');
    for (let i = 0; i < 3; i++) {
      if (i) fireEvent.click(view.getByText('Agregar otra clave API'));
      assert.equal(view.container.querySelectorAll('input[type=password]').length, 1);
      fireEvent.change(field(), { target: { value: 'AIzaSynthetic-' + i } });
      fireEvent.click(view.getByText('Conectar clave API'));
      await view.findByText('Agregar otra clave API');
      assert.equal(view.container.querySelectorAll('input[type=password]').length, 0);
      assert.equal(connections.length, i + 1);
    }
    assert.equal(view.getAllByText('Usar esta clave').length, 2);
    fireEvent.click(view.getAllByText('Usar esta clave')[0]);
    await waitFor(() => assert.equal(connections[1].metadata.is_default, true));
    assert.equal(connections[0].metadata.is_default, false);
    assert(changes.some(args => args[0] === 'gemini' && args[1] === true));
  } finally {
    cleanup(); globalThis.fetch = originalFetch; supabase.auth.getSession = originalSession;
    await supabase.auth.stopAutoRefresh();
    (supabase.auth as any).broadcastChannel?.close();
    dom.window.close();
  }
});
