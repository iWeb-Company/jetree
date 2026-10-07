'use client';

import { toolErrorMessage } from '@/lib/tool-feedback';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Connection = { provider: 'github' | 'google_drive'; status: string; scopes: string[]; expires_at: string | null; account_label: string | null };
type Approval = { id: string; agent_id: string; provider: string; tool_id: string; operation: string; input: Record<string, unknown>; created_at: string };

export default function ToolConnectionsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Iniciá sesión para administrar herramientas.');
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/agent-tools', { headers: await headers(), cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el estado de herramientas.');
    setConnections(payload.connections || []);
    setApprovals(payload.pendingApprovals || []);
    setCalls(payload.calls || []);
  }, [headers]);

  useEffect(() => { if (isOpen) refresh().catch(error => setNotice(error.message)); }, [isOpen, refresh]);
  if (!isOpen) return null;

  const connect = async (provider: Connection['provider']) => {
    setBusy(provider); setNotice('');
    try {
      const response = await fetch(`/api/tool-connections/oauth?provider=${provider}`, { headers: await headers(), cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || 'No se pudo iniciar la conexión OAuth.');
      window.location.assign(payload.authorizationUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo iniciar OAuth.'); setBusy(''); }
  };

  const disconnect = async (provider: Connection['provider']) => {
    setBusy(provider); setNotice('');
    try {
      const response = await fetch(`/api/tool-connections?provider=${provider}`, { method: 'DELETE', headers: await headers() });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo revocar la conexión.');
      setNotice(payload.remoteRevoked ? 'Conexión revocada en el proveedor y eliminada de Jetree.' : 'Credencial eliminada de Jetree; el proveedor no confirmó la revocación remota.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo revocar la conexión.'); }
    finally { setBusy(''); }
  };

  const decide = async (approvalId: string, decision: 'approve' | 'reject') => {
    setBusy(approvalId); setNotice('');
    try {
      const response = await fetch('/api/agent-tools/approvals', {
        method: 'POST', headers: { ...(await headers()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo resolver la aprobación.');
      const resultText = payload.result === undefined ? '' : ` Resultado: ${JSON.stringify(payload.result).slice(0, 900)}`;
      if (decision === 'approve') window.dispatchEvent(new CustomEvent('jetree-tool-result', { detail: { message: payload.message, conversationId: payload.conversationId } }));
      setNotice(decision === 'approve' ? `Acción aprobada y ejecutada.${resultText}` : 'Acción rechazada.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo resolver la aprobación.'); }
    finally { setBusy(''); }
  };

  const providerName = (provider: string) => provider === 'github' ? 'GitHub' : 'Google Drive';
  const connectorCards: Array<{ id: Connection['provider']; icon: string; title: string; description: string; scopes: string }> = [
    { id: 'github', icon: '🐙', title: 'GitHub', description: 'Repositorios públicos: lectura, issues y creación de archivos. Cada escritura requiere aprobación.', scopes: 'Scopes OAuth: read:user, public_repo' },
    { id: 'google_drive', icon: '📁', title: 'Google Drive', description: 'Busca, lee y crea documentos propiedad de esta integración. Cada creación requiere aprobación.', scopes: 'Scope OAuth: drive.file' },
  ];

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
    <div className="max-h-[92vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-950/80 bg-[#080c14] p-6 shadow-2xl">
      <div className="flex items-start justify-between border-b border-cyan-950/60 pb-4">
        <div><h3 className="text-lg font-bold text-white">🔌 Conectores de herramientas</h3><p className="mt-1 text-xs text-gray-400">Autorizá GitHub y Drive por usuario; los tokens se guardan cifrados en el servidor.</p></div>
        <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 rounded-lg border border-gray-800 bg-gray-900 text-gray-400">✕</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {connectorCards.map(card => {
          const connection = connections.find(item => item.provider === card.id && item.status === 'connected');
          return <section key={card.id} className="space-y-3 rounded-xl border border-cyan-950/60 bg-[#05070b] p-4">
            <div className="flex items-center justify-between"><h4 className="font-semibold text-white">{card.icon} {card.title}</h4><span className={`rounded-full px-2 py-1 text-[10px] ${connection ? 'bg-emerald-950 text-emerald-300' : 'bg-gray-900 text-gray-400'}`}>{connection ? 'Conectado' : 'Desconectado'}</span></div>
            <p className="text-xs text-gray-400">{card.description}</p>
            <p className="text-[10px] text-gray-500">{card.scopes}</p>
            {connection && <p className="text-[10px] text-gray-400">Cuenta: {connection.account_label || 'conectada'} · permisos: {(connection.scopes || []).join(', ') || 'según la app OAuth'}</p>}
            <button disabled={busy === card.id} onClick={() => connection ? disconnect(card.id) : connect(card.id)} className="rounded-lg border border-cyan-900 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{busy === card.id ? 'Procesando…' : connection ? 'Revocar conexión' : 'Conectar'}</button>
          </section>;
        })}
      </div>

      <section className="space-y-3"><h4 className="text-sm font-semibold text-white">Aprobaciones pendientes ({approvals.length})</h4>
        {approvals.length === 0 ? <p className="text-xs text-gray-500">No hay escrituras esperando aprobación.</p> : approvals.map(item => <article key={item.id} className="space-y-2 rounded-xl border border-amber-800/50 bg-amber-950/10 p-3">
          <div className="text-xs text-amber-200">{providerName(item.provider)} · {item.operation} · Agente {item.agent_id}</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/30 p-2 text-[10px] text-gray-300">{JSON.stringify(item.input, null, 2)}</pre>
          <div className="flex gap-2"><button disabled={busy === item.id} onClick={() => decide(item.id, 'approve')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white">Aprobar y ejecutar</button><button disabled={busy === item.id} onClick={() => decide(item.id, 'reject')} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-200">Rechazar</button></div>
        </article>)}
      </section>

      <section className="space-y-2"><h4 className="text-sm font-semibold text-white">Registro reciente</h4>
        {calls.slice(0, 8).map(call => <div key={call.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 px-3 py-2 text-[10px]"><span className="text-gray-300">{providerName(call.provider)} · {call.operation}{call.status === 'failed' && <span className="mt-1 block text-rose-300">{toolErrorMessage(call.error_code)}</span>}</span><span className={call.status === 'succeeded' ? 'text-emerald-300' : call.status === 'failed' ? 'text-rose-300' : 'text-amber-300'}>{call.status}</span></div>)}
      </section>
      {notice && <p role="status" className="rounded-lg bg-cyan-950/30 p-3 text-xs text-cyan-200">{notice}</p>}
      <div className="flex justify-end border-t border-cyan-950/60 pt-3"><button onClick={onClose} className="rounded-xl bg-gray-900 px-4 py-2 text-xs text-white">Cerrar</button></div>
    </div>
  </div>;
}
