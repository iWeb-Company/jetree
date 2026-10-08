'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ClaudeConsent() {
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [session, setSession] = useState(false);
  const [writes, setWrites] = useState(false);
  const [requestedWrites, setRequestedWrites] = useState(false);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  async function load() {
    const { data } = await supabase.auth.getSession();
    setSession(Boolean(data.session));
    if (!data.session) return;
    const response = await fetch('/api/agents', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudieron cargar tus agentes.');
    const payload = await response.json(); setAgents(payload.agents || []);
  }
  useEffect(() => {
    setRequestedWrites((new URLSearchParams(window.location.search).get('scope') || '').split(' ').includes('jetree:request-write'));
    load().catch(error => setNotice(error.message));
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('');
    try { const { error } = await supabase.auth.signInWithPassword({ email, password }); setPassword(''); if (error) throw new Error('No se pudo iniciar sesión. Revisá tu correo y contraseña de Jetree.'); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); } finally { setBusy(false); }
  }
  async function decide(decision: 'approve' | 'deny') {
    setBusy(true); setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Iniciá sesión en Jetree.');
      const response = await fetch('/api/mcp-oauth/consent', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: window.location.search.slice(1), decision, agentIds: selected, allowWrites: writes }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      const destination = new URL(body.redirect);
      if (!['https://claude.ai', 'https://claude.com'].includes(destination.origin) || destination.pathname !== '/api/mcp/auth_callback') throw new Error('Destino de autorización inválido.');
      window.location.assign(destination.toString());
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo autorizar.'); setBusy(false); }
  }
  return <main className="min-h-dvh bg-[#080c14] px-4 py-8 text-gray-200"><section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-purple-800 p-5">
    <h1 className="text-xl font-bold">Autorizar Claude en Jetree</h1>
    <p>Claude podrá consultar herramientas de los agentes que elijas, usando tus conexiones de GitHub y Drive. No obtiene tus claves ni el historial de chats. Tu conversación con Claude ocurre en su aplicación oficial.</p>
    {!session ? <form onSubmit={login} className="space-y-3"><p>Iniciá sesión con tu cuenta de Jetree para revisar los permisos.</p><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo de Jetree" aria-label="Correo de Jetree" autoComplete="username" className="w-full rounded bg-gray-900 p-3" /><input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña de Jetree" aria-label="Contraseña de Jetree" autoComplete="current-password" className="w-full rounded bg-gray-900 p-3" /><button disabled={busy} className="rounded bg-purple-700 px-4 py-3">Iniciar sesión</button></form> : <>
      <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Elegí los agentes accesibles desde Claude</legend>{agents.map(agent => <label key={agent.id} className="flex items-center gap-3"><input type="checkbox" checked={selected.includes(agent.id)} onChange={e => setSelected(items => e.target.checked ? [...items, agent.id] : items.filter(id => id !== agent.id))} />{agent.name}</label>)}{!agents.length && <p>Necesitás un agente activo. Crealo en Jetree y volvé a conectar.</p>}</fieldset>
      {requestedWrites && <label className="flex items-start gap-3"><input type="checkbox" checked={writes} onChange={e => setWrites(e.target.checked)} /><span>Permitir propuestas de cambios. Cada escritura requiere mi aprobación dentro de Jetree; Claude no puede aprobarla.</span></label>}
      <p className="text-sm text-gray-400">Acceso por 7 días, revocable en Conexiones de modelos. La selección de agentes y tus permisos se comprueban en cada solicitud.</p>
      <div className="flex flex-wrap gap-3"><button disabled={busy || !selected.length} onClick={() => decide('approve')} className="rounded bg-purple-700 px-4 py-3 disabled:opacity-40">Autorizar agentes seleccionados</button><button disabled={busy} onClick={() => decide('deny')} className="rounded border border-gray-700 px-4 py-3">Cancelar</button></div>
    </>}
    {notice && <p role="status" className="text-amber-200">{notice}</p>}
  </section></main>;
}
