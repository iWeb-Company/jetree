'use client';
import { useEffect, useState } from 'react';
import { personalModelHeaders } from '@/components/PersonalModelConnections';
type Connection = { id: string; scopes: string[]; agent_ids: string[]; expires_at: string };
export default function ClaudeMcpConnection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [url, setUrl] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/mcp-connections', { headers: await personalModelHeaders(), cache: 'no-store' });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); setConnections(body.connections || []);
  }
  useEffect(() => { setUrl(window.location.origin + '/mcp'); load().catch(error => setNotice(error.message)); }, []);
  async function revoke(id: string) {
    setBusy(true); setNotice('');
    try { const response = await fetch('/api/mcp-connections?id=' + encodeURIComponent(id), { method: 'DELETE', headers: await personalModelHeaders() }); if (!response.ok) throw new Error('No se pudo revocar.'); await load(); setNotice('Acceso de Claude revocado. Volvé a conectarlo si querés autorizarlo otra vez.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar.'); } finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-purple-800/50 p-4 text-xs">
    <h4 className="font-semibold text-white">Claude · usar mi suscripción</h4>
    <p className="text-gray-400">Conversás en Claude y habilitás Jetree como conector. Claude usa su propio plan; Jetree aporta tus herramientas sin ejecutar modelos ni cobrar una API por este flujo.</p>
    <label className="block text-gray-300">Dirección del conector<input readOnly value={url} aria-label="Dirección del MCP de Jetree" onFocus={event => event.currentTarget.select()} className="mt-2 w-full min-w-0 rounded bg-gray-900 p-2 font-mono" /></label>
    <ol className="list-inside list-decimal space-y-2 text-gray-400">
      <li>En Claude abrí Personalizar → Conectores → Agregar conector personalizado y llamalo Jetree.</li>
      <li>Pegá esta dirección. Elegí iniciar sesión y, en cliente OAuth, Registrar automáticamente. Si pide un ID manual, usá <code>jetree-claude</code>, sin secreto.</li>
      <li>Iniciá sesión en Jetree. Elegí los agentes que querés permitir. Podés habilitar propuestas de cambios; cada escritura se aprueba en Jetree.</li>
      <li>En el chat de Claude activá Jetree desde + → Conectores. Pedile: «Mostrá mis agentes de Jetree y las herramientas disponibles».</li>
      <li>Para cambios, abrí <a href="/claude/aprobaciones" target="_blank" rel="noreferrer" className="text-cyan-300 underline">las aprobaciones de Jetree</a>. Revisá los datos y aprobá o rechazá. Luego pedile a Claude que consulte el estado.</li>
    </ol>
    <p className="text-gray-500">Cada persona autoriza su propia cuenta. En Team o Enterprise, un propietario debe agregar primero el conector para la organización. El acceso vence en 7 días; reconectá para renovarlo. Claude recibe los datos que consultes en GitHub o Drive; revisá qué compartís.</p>
    <a href="/ayuda/conexiones" target="_blank" rel="noreferrer" className="block text-cyan-300 underline">Guía completa y solución de problemas</a>
    {connections.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-800 p-2"><span>{item.agent_ids.length} agentes · {item.scopes.includes('jetree:request-write') ? 'Lectura y propuestas' : 'Solo lectura'}</span><button disabled={busy} onClick={() => revoke(item.id)} className="text-rose-300">Revocar acceso de Claude</button></div>)}
    <button disabled={busy} onClick={() => load().catch(error => setNotice(error.message))} className="text-cyan-300">Actualizar conexiones</button>
    {notice && <p role="status" className="text-amber-200">{notice}</p>}
  </section>;
}
