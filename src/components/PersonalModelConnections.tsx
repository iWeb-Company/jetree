'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PersonalModelDevice { id: string; name: string; provider: string; online: boolean }
export async function personalModelHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Iniciá sesión para administrar tus equipos.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export default function PersonalModelConnections() {
  const [devices, setDevices] = useState<PersonalModelDevice[]>([]);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const response = await fetch('/api/model-devices', { headers: await personalModelHeaders(), cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDevices(body.devices || []);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudieron cargar los equipos.'); }
  };
  useEffect(() => { load(); }, []);
  const perform = async (method: 'POST' | 'DELETE', id = '') => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/model-devices${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method, headers: await personalModelHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
      if (method === 'POST') { setCode(body.pairingCode); setNotice('Código válido por 5 minutos y una sola vez. No lo compartas: vincula el equipo a tu cuenta.'); }
      else { setNotice('Equipo revocado y trabajos pendientes cancelados.'); await load(); }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-purple-800/50 p-4 text-xs">
    <h4 className="font-semibold text-white">Cuenta Google · conector personal</h4>
    <p className="text-gray-400">Iniciá sesión con Google en tu equipo. Cada usuario conecta su propia cuenta. El equipo debe permanecer encendido. En el chat elegí esta conexión: no cambia automáticamente al consumo por API.</p>
    <p className="text-gray-400">Primera versión: chat web con la selección automática de modelos del Gemini CLI. El catálogo API del agente se usa cuando elegís API; no representa los modelos de tu suscripción.</p>
    <a href="/ayuda/conexiones#google" target="_blank" rel="noreferrer" className="block text-cyan-300 underline">Instalar y conectar mi equipo · guía paso a paso</a>
    {devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-800 p-2">
      <span>{device.name} · {device.online ? 'Conectado' : 'Desconectado'}</span>
      <button disabled={busy} onClick={() => perform('DELETE', device.id)} className="text-rose-300">Revocar equipo</button>
    </div>)}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => perform('POST')} className="rounded bg-purple-900 px-3 py-2 text-white">Vincular mi equipo</button>
      <button disabled={busy} onClick={load} className="text-cyan-300">Actualizar estado</button>
    </div>
    {code && <input readOnly value={code} aria-label="Código de vinculación personal" className="w-full min-w-0 rounded bg-gray-900 p-2 font-mono" onFocus={event => event.currentTarget.select()} />}
    {notice && <p role="status" className="text-amber-200">{notice}</p>}
    <p className="text-gray-500">ChatGPT por suscripción: pendiente de acceso autorizado por OpenAI. Claude por suscripción se usa desde su aplicación oficial con el conector de Jetree; en el chat de Jetree sigue disponible por API.</p>
  </section>;
}
