'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Source = { id: string; title: string; action?: 'connections' | 'tools' | 'organization' | 'coding' };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[]; failed?: boolean; mode?: string; notice?: string };
const suggestions = ['¿Cómo conecto mi API?', '¿Qué puede hacer un manager?', '¿Cómo creo un PDF?', '¿Cómo conecto Obsidian?'];

export default function SupportChat({ onNavigate }: { onNavigate: (action: NonNullable<Source['action']>) => void }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) field.current?.focus(); }, [open, consent]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  const send = async (question: string) => {
    if (busy || !consent || !question.trim()) return;
    const clean: Message[] = messages.filter(message => !message.failed).slice(-8);
    const history: Message[] = [...clean, { role: 'user', content: question.trim() }];
    setMessages(history); setInput(''); setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Iniciá sesión de nuevo para usar la ayuda.');
      const wireHistory = history.map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
      while (wireHistory.length > 1 && wireHistory.reduce((total, message) => total + message.content.length, 0) > 9000) wireHistory.splice(0, 2);
      const response = await fetch('/api/support/chat', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: wireHistory }), signal: abort.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo consultar la ayuda.');
      setMessages(current => [...current, { role: 'assistant', content: payload.answer, sources: payload.sources, mode: payload.mode, notice: payload.notice }]);
    } catch (error) {
      if (!abort.signal.aborted) setMessages(current => [...current.slice(0, -1), { role: 'assistant', content: error instanceof Error ? error.message : 'No se pudo consultar la ayuda.', failed: true }]);
      setInput(question);
    } finally { if (!abort.signal.aborted) setBusy(false); }
  };
  return <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
    {open && <section aria-label="Ayuda de Jetree" onKeyDown={event => { if (event.key === 'Escape') close(); }} className="mb-3 flex h-[min(620px,calc(100dvh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-cyan-700/60 bg-[#080f1c] shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between gap-2 border-b border-cyan-950 p-4"><div><h2 className="font-semibold text-cyan-100">Ayuda de Jetree</h2><p className="text-[10px] text-gray-400">Guía con IA · Puede equivocarse</p></div><div className="flex gap-2"><button aria-label="Nueva consulta de soporte" disabled={busy} onClick={() => { setMessages([]); setInput(''); field.current?.focus(); }} className="rounded p-2 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-40">Nueva</button><button onClick={close} aria-label="Cerrar ayuda" className="rounded p-2 text-gray-300 hover:bg-gray-800">✕</button></div></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs leading-relaxed text-gray-400">Te explico cómo usar Jetree. No veo tus cuentas ni ejecuto acciones. Evitá claves, correos privados y datos sensibles.</p>
        {!consent ? <div className="rounded-xl border border-cyan-900 bg-cyan-950/20 p-4"><p className="text-sm text-gray-200">Tus preguntas y el historial de esta ayuda se enviarán a OpenRouter y al proveedor gratuito seleccionado, junto con documentación de Jetree. No se incluyen automáticamente datos del workspace.</p><p className="mt-3 text-xs text-gray-400">La conversación se mantiene solo mientras esta pantalla está abierta y se elimina al recargar. «Nueva» borra el historial local de esta ayuda; no elimina datos retenidos por el proveedor.</p><button onClick={() => setConsent(true)} className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-gray-950">Entendido, abrir ayuda</button><a href="/ayuda/notas" className="mt-3 block text-xs text-cyan-300">Ver guía de Notion y Obsidian sin IA</a></div> : <>
          {!messages.length && <div className="space-y-2"><p className="text-sm text-gray-200">¿Qué querés hacer?</p>{suggestions.map(question => <button key={question} onClick={() => send(question)} className="block w-full rounded-lg border border-cyan-900/60 p-3 text-left text-xs text-cyan-200 hover:bg-cyan-950/40">{question}</button>)}</div>}
          <div role="log" aria-label="Conversación de ayuda" aria-live="polite" className="space-y-4">
            {messages.map((message, index) => <div key={index} className={`rounded-xl p-3 text-sm ${message.role === 'user' ? 'ml-5 bg-cyan-950/50 text-cyan-100' : message.failed ? 'border border-amber-900 bg-amber-950/20 text-amber-200' : 'mr-3 bg-gray-900 text-gray-200'}`}>
              <p className="mb-1 text-[10px] uppercase text-gray-500">{message.role === 'user' ? 'Vos' : message.failed ? 'No se pudo completar' : message.mode === 'documentation' ? 'Ayuda Jetree · Documentación' : 'Ayuda Jetree · Guía documentada'}</p>
              {message.notice && <p className={`mb-3 rounded-lg border p-2 text-xs ${message.mode === 'ai' ? 'border-cyan-900 bg-cyan-950/20 text-cyan-200' : 'border-amber-900/70 bg-amber-950/20 text-amber-200'}`}>{message.notice}</p>}
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
              {Boolean(message.sources?.length) && <div className="mt-3 border-t border-gray-700 pt-2"><p className="text-[10px] text-gray-500">Documentación consultada</p>{message.sources!.map(source => <div key={source.id} className="mt-1 text-xs text-gray-400">{source.title}{source.action && <button onClick={() => { onNavigate(source.action!); close(); }} className="ml-2 text-cyan-300 hover:underline">Abrir sección ↗</button>}</div>)}</div>}
            </div>)}
          </div>
        </>}
        {busy && <p role="status" className="animate-pulse text-xs text-cyan-300">Consultando la documentación…</p>}<div ref={bottom} />
      </div>
      {consent && <form onSubmit={event => { event.preventDefault(); send(input); }} className="border-t border-cyan-950 p-3"><label htmlFor="jetree-support-input" className="sr-only">Pregunta sobre Jetree</label><textarea id="jetree-support-input" ref={field} value={input} onChange={event => setInput(event.target.value)} maxLength={2000} rows={2} disabled={busy} placeholder="Preguntá cómo usar Jetree…" className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm text-white disabled:opacity-50" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-gray-500">Sin acceso a tus datos · {input.length}/2000</span><button disabled={busy || !input.trim()} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-gray-950 disabled:opacity-40">Enviar</button></div></form>}
    </section>}
    <div className="flex justify-end"><button ref={launcher} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? 'Ocultar ayuda de Jetree' : 'Abrir ayuda de Jetree'} className="flex items-center gap-2 rounded-full border border-cyan-500/50 bg-[#0b2835] px-4 py-3 text-sm font-semibold text-cyan-100 shadow-lg shadow-black/40 hover:bg-cyan-950"><span aria-hidden="true">?</span> Ayuda Jetree</button></div>
  </div>;
}
