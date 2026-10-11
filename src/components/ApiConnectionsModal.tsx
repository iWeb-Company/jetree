'use client';

import React, { useEffect, useState } from 'react';
import type { UserSubscription } from '@/types';
import { supabase } from '@/lib/supabase';
import { API_PROVIDERS, PROVIDER_LABELS, connectionLabel, type ApiConnection } from '@/lib/api-providers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  subscriptions: UserSubscription[];
  onConnectionChange: (provider: UserSubscription['provider'], connected: boolean, connectedAt?: string) => void;
}
export default function ApiConnectionsModal({ isOpen, onClose, userEmail, onConnectionChange }: Props) {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const headers = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Iniciá sesión para administrar conexiones.');
    return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
  };
  const load = async (notify = false) => {
    const response = await fetch('/api/provider-connections', { headers: await headers(), cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las conexiones.');
    const rows: ApiConnection[] = body.connections || [];
    setConnections(rows); setLoaded(true);
    if (notify) for (const provider of API_PROVIDERS) {
      const selected = rows.find(row => row.provider === provider && row.metadata?.is_default);
      onConnectionChange(provider, selected?.status === 'connected', selected?.connected_at);
    }
  };
  useEffect(() => {
    setApiKey(''); setAdding(false); setNotice(''); setLoaded(false); setConnections([]);
    if (!isOpen) return;
    let active = true;
    (async () => {
      const response = await fetch('/api/provider-connections', { headers: await headers(), cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las conexiones.');
      if (active) { setConnections(body.connections || []); setLoaded(true); }
    })().catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [isOpen, userEmail]);
  if (!isOpen) return null;
  const perform = async (method: 'POST' | 'DELETE', body?: object, id?: string) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/provider-connections${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method, headers: await headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
      if (result.connection) {
        setApiKey(''); setAdding(false);
        setNotice(`${PROVIDER_LABELS[result.connection.provider as ApiConnection['provider']]} detectado. Clave validada y guardada.`);
      } else setNotice(method === 'DELETE' ? 'Clave eliminada.' : 'Conexión actualizada.');
      await load(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="model-connections-title" className="max-h-[92dvh] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-950 bg-[#080c14] p-4 shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h3 id="model-connections-title" className="text-lg font-bold text-white">Conexiones de modelos</h3><p className="mt-1 break-all text-xs text-gray-400">Tus claves API · {userEmail}</p></div>
        <button disabled={busy} onClick={onClose} aria-label="Cerrar conexiones" className="rounded-lg p-2 text-gray-300">✕</button>
      </header>
      <p className="text-sm text-gray-300">Pegá una clave API. Detectamos y validamos Google, Claude, OpenAI, OpenRouter, DeepSeek o Groq.</p>
      {!loaded && <button disabled={busy} onClick={() => load().catch(error => setNotice(error.message))} className="text-xs text-cyan-300">Cargar conexiones</button>}
      {connections.map(connection => <section key={connection.id} className="space-y-2 rounded-xl border border-cyan-950 bg-[#05070b] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm text-white">{connectionLabel(connection)}</h4><span className="text-xs text-gray-400">{connection.status === 'connected' ? 'Validada' : 'Requiere validación'}</span></div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {connection.metadata?.is_default ? <span className="text-emerald-300">Seleccionada para tus agentes y Telegram</span> : <button disabled={busy || connection.status !== 'connected'} onClick={() => perform('POST', { action: 'select', connectionId: connection.id })} className="text-cyan-300 disabled:opacity-40">Usar esta clave</button>}
          <button disabled={busy} onClick={() => perform('POST', { action: 'validate', connectionId: connection.id })} className="text-gray-300">Validar</button>
          <button disabled={busy} onClick={() => perform('DELETE', undefined, connection.id)} className="text-rose-300">Eliminar</button>
        </div>
      </section>)}
      {loaded && (connections.length === 0 || adding) ? <form onSubmit={event => { event.preventDefault(); perform('POST', { apiKey }); }} className="space-y-3">
        <label className="block text-xs text-gray-300" htmlFor="model-api-key">Clave API</label>
        <input id="model-api-key" type="password" autoComplete="off" spellCheck={false} disabled={busy} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Pegá tu clave API" className="w-full min-w-0 rounded-lg border border-cyan-950 bg-[#05070b] p-3 text-sm text-white" />
        <div className="flex gap-3"><button disabled={busy || !apiKey.trim()} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">{busy ? 'Detectando y validando…' : 'Conectar clave API'}</button>{connections.length > 0 && <button type="button" disabled={busy} onClick={() => { setAdding(false); setApiKey(''); }} className="text-xs text-gray-300">Cancelar</button>}</div>
      </form> : loaded && <button disabled={busy} onClick={() => { setAdding(true); setNotice(''); }} className="rounded-lg border border-cyan-800 px-4 py-2 text-xs text-cyan-300">Agregar otra clave API</button>}
      {notice && <p role="status" className="text-xs text-amber-200">{notice}</p>}
      <p className="text-xs leading-relaxed text-gray-500">Una clave habilita el catálogo de su proveedor. Elegí el modelo al configurar el agente. Las claves se cifran y nunca se muestran de nuevo. Las claves antiguas con prefijo sk- se validan con OpenAI y DeepSeek para identificar el proveedor.</p>
      <a href="/ayuda/conexiones" className="block text-xs text-cyan-300 underline">Ayuda de conexiones API</a>
    </div>
  </div>;
}
