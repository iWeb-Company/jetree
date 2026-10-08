'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Approval = { id: string; agent_id: string; conversation_id: string | null; provider: string; operation: string; input: Record<string, unknown> };

export default function ChatApprovals({ conversationId, refreshKey }: { conversationId: string | null; refreshKey: number }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setItems([]);
    if (!conversationId) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      const response = await fetch('/api/agent-tools', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (active) setItems((payload.pendingApprovals || []).filter((item: Approval) => item.conversation_id === conversationId));
    })().catch(() => { if (active) setNotice('No se pudieron cargar las aprobaciones; revisá Conexiones.'); });
    return () => { active = false; };
  }, [conversationId, refreshKey]);

  const decide = async (item: Approval, decision: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(item.id); setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error('La sesión expiró.');
      const response = await fetch('/api/agent-tools/approvals', {
        method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: item.id, decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
      setItems(current => current.filter(approval => approval.id !== item.id));
      if (payload.message) window.dispatchEvent(new CustomEvent('jetree-tool-result', { detail: { message: payload.message, conversationId: payload.conversationId } }));
      setNotice(decision === 'approve' ? 'Acción ejecutada y registrada.' : 'Acción rechazada.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(''); }
  };

  return <section aria-label="Aprobaciones de esta conversación" className="space-y-3">
    {items.map(item => <div key={item.id} className="rounded-xl border border-amber-700/50 bg-amber-950/10 p-3">
      <p className="text-xs text-amber-200">{item.provider} · {item.operation} · requiere tu aprobación</p>
      <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-300">{JSON.stringify(item.input, null, 2)}</pre>
      <div className="flex flex-wrap gap-2">
        <button disabled={Boolean(busy)} onClick={() => decide(item, 'approve')} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs text-black disabled:opacity-50">Aprobar y ejecutar</button>
        <button disabled={Boolean(busy)} onClick={() => decide(item, 'reject')} className="rounded-lg border border-gray-700 px-4 py-2 text-xs text-gray-200 disabled:opacity-50">Rechazar</button>
      </div>
    </div>)}
    {notice && <p role="status" className="text-xs text-cyan-200">{notice}</p>}
  </section>;
}
