'use client';

import { mergeToolMessage } from '@/lib/tool-feedback';
import ChatApprovals from '@/components/ChatApprovals';
import { PersonalModelDevice, personalModelHeaders } from '@/components/PersonalModelConnections';

import React, { useState, useRef, useEffect } from 'react';
import { Agent, ChatMessage, AgentActivityLog } from '@/types';
import { supabase } from '@/lib/supabase';

interface AgentChatDrawerProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  availableAgents: Agent[];
  onNewLog: (log: AgentActivityLog) => void;
  onManageTools?: () => void;
}

export default function AgentChatDrawer({
  isOpen,
  agent,
  onClose,
  availableAgents,
  onNewLog,
  onManageTools,
}: AgentChatDrawerProps) {
  const isManager = agent?.roleType === 'manager';
  const subordinates = React.useMemo(
    () => agent ? availableAgents.filter(a => agent.subordinateIds?.includes(a.id)) : [],
    [agent, availableAgents],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [toolInput, setToolInput] = useState('{}');
  const [toolBusy, setToolBusy] = useState(false);
  const [toolNotice, setToolNotice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const usableToolIds = (agent?.enabledPluginIds || []).filter(id => ['plugin-github-core', 'plugin-google-drive-core'].includes(id));
  const operationsByTool: Record<string, Array<{ id: string; label: string; sample: Record<string, unknown> }>> = {
    'plugin-github-core': [
      { id: 'list_repositories', label: 'Listar repositorios públicos', sample: {} },
      { id: 'get_file', label: 'Leer archivo', sample: { owner: 'iWeb-Company', repo: 'jetree', path: 'README.md' } },
      { id: 'create_issue', label: 'Crear issue (requiere aprobación)', sample: { owner: 'iWeb-Company', repo: 'jetree', title: 'Título', body: 'Descripción' } },
      { id: 'create_file', label: 'Crear archivo (requiere aprobación)', sample: { owner: 'iWeb-Company', repo: 'jetree', path: 'docs/nota.md', message: 'docs: add note', content: 'Contenido' } },
    ],
    'plugin-google-drive-core': [
      { id: 'search_files', label: 'Buscar archivos', sample: { query: 'informe', pageSize: 10 } },
      { id: 'get_text_file', label: 'Leer archivo de texto', sample: { fileId: 'ID_DEL_ARCHIVO' } },
      { id: 'create_doc', label: 'Crear documento (requiere aprobación)', sample: { name: 'Nuevo documento', content: 'Contenido' } },
    ],
  };

  useEffect(() => {
    if (!usableToolIds.length) return;
    const toolId = usableToolIds.includes(selectedToolId) ? selectedToolId : usableToolIds[0];
    const operations = operationsByTool[toolId] || [];
    const operation = operations.find(item => item.id === selectedOperation) || operations[0];
    setSelectedToolId(toolId);
    if (operation) { setSelectedOperation(operation.id); setToolInput(JSON.stringify(operation.sample, null, 2)); }
  // Initialize the tool runner from the agent's enabled connector set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, usableToolIds.join(',')]);

  useEffect(() => {
    if (!agent || !isOpen) return;
    let active = true;
    setMessages([]);
    setConversationId(null);

    const loadSharedConversation = async () => {
      const welcome: ChatMessage = {
        id: `msg-${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: isManager
          ? `👋 Hola, soy **${agent.name}**, Manager y Orquestador. Tengo a mi cargo a **${subordinates.length} especialistas** (${subordinates.map(s => s.name).join(', ')}). Cuéntame tu objetivo y me encargaré de coordinar la solución o delegarla a quien corresponda.`
          : `👋 Hola, soy **${agent.name}**. ¿En qué puedo ayudarte hoy dentro de mi especialidad?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) {
          if (active) setMessages([welcome]);
          return;
        }
        const response = await fetch(`/api/conversations?agentId=${encodeURIComponent(agent.id)}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el chat compartido.');
        if (!active) return;
        setConversationId(payload.conversation?.id || null);
        setMessages(Array.isArray(payload.messages) && payload.messages.length ? payload.messages : [welcome]);
      } catch {
        if (active) setMessages([welcome]);
      }
    };

    loadSharedConversation();
    return () => { active = false; };
  }, [agent, isManager, isOpen, subordinates]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!agent || !isOpen) return;
    const onToolResult = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      if (!payload?.message?.id || payload.conversationId !== conversationId) return;
      setMessages(current => mergeToolMessage(current, payload.message));
    };
    window.addEventListener('jetree-tool-result', onToolResult);
    return () => window.removeEventListener('jetree-tool-result', onToolResult);
  }, [agent, isOpen, conversationId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading || !agent) return;

    const userMsgText = inputText.trim();
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agentId: agent.id,
      role: 'user',
      content: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) throw new Error('La sesión expiró. Iniciá sesión nuevamente.');
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          agentId: agent.id,
          conversationId,
          message: userMsgText,
          modelSource: 'api',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al comunicarse con el agente');
      }
      setConversationId(data.conversationId || conversationId);

      // Propagar logs generados a la consola de monitoreo global
      if (data.logs && Array.isArray(data.logs)) {
        data.logs.forEach((log: AgentActivityLog) => onNewLog(log));
      }

      const agentReply: ChatMessage = {
        id: `agent-${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        delegation: data.delegation,
      };

      setMessages(prev => [...prev, agentReply]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: `❌ Error al procesar: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const runTool = async () => {
    if (!agent || !selectedToolId || !selectedOperation || toolBusy) return;
    let input: unknown;
    try { input = JSON.parse(toolInput); } catch { setToolNotice('El formato de entrada debe ser JSON válido.'); return; }
    setToolBusy(true); setToolNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('La sesión expiró. Iniciá sesión nuevamente.');
      const response = await fetch('/api/agent-tools', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, conversationId, toolId: selectedToolId, operation: selectedOperation, input }),
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(payload.error || 'La herramienta no pudo ejecutarse.');
      if (payload.pendingApproval) {
        setToolNotice('La escritura quedó pendiente. Revisá el detalle en Herramientas y aprobala para ejecutarla.');
        onManageTools?.();
      } else {
        if (payload.message?.agentId === agent.id) setMessages(current => mergeToolMessage(current, payload.message));
        setToolNotice('Lectura completada y registrada en auditoría.');
      }
    } catch (error) { setToolNotice(error instanceof Error ? error.message : 'La herramienta no pudo ejecutarse.'); }
    finally { setToolBusy(false); }
  };

  if (!isOpen || !agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#080c14] border-l border-cyan-950/80 h-[100dvh] min-w-0 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Top Header */}
        <div className="min-h-20 px-4 sm:px-6 py-3 border-b border-cyan-950/60 bg-[#0b101d]/60 flex flex-wrap gap-2 items-center justify-between shrink-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl border ${
              isManager 
                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300' 
                : 'bg-gray-900 border-gray-800 text-gray-200'
            }`}>
              {agent.avatar || (isManager ? '👑' : '🤖')}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 title={agent.name} className="line-clamp-2 font-bold text-white text-base leading-tight">{agent.name}</h3>
                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-mono font-bold ${
                  isManager 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {isManager ? 'Manager' : 'Especialista'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-cyan-400 font-mono">[{agent.model}]</span>
                <span>•</span>
                <span className="text-emerald-400">● Conectado</span>
              </p>
              <p className="mt-1 text-[10px] text-cyan-400/80">Conversación compartida con el departamento</p>
            </div>
          </div>
          {usableToolIds.length > 0 && <button onClick={() => setToolPanelOpen(value => !value)} className="mr-2 rounded-lg border border-cyan-800/60 px-3 py-2 text-xs text-cyan-200">Opciones avanzadas</button>}
          <button
            onClick={onClose}
            aria-label="Cerrar conversación"
            className="w-9 h-9 shrink-0 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Banner informativo de subordinados si es Manager */}
        {isManager && subordinates.length > 0 && (
          <div className="px-4 sm:px-6 py-2.5 bg-cyan-950/20 border-b border-cyan-950/60 flex flex-wrap gap-2 items-center justify-between text-xs">
            <span className="text-gray-300 flex items-center gap-1.5">
              <span>👥</span>
              <span>Especialistas a su cargo para derivar tareas:</span>
            </span>
            <div className="flex items-center gap-1">
              {subordinates.map(sub => (
                <span key={sub.id} className="px-2 py-0.5 rounded bg-cyan-900/30 text-cyan-300 text-[10px] border border-cyan-800/40">
                  {sub.name.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {toolPanelOpen && usableToolIds.length > 0 && <section className="space-y-2 border-b border-cyan-950/70 bg-[#070b12] p-4">
          <div className="flex flex-wrap gap-2">
            <select value={selectedToolId} onChange={event => {
              const next = event.target.value;
              const first = operationsByTool[next]?.[0];
              setSelectedToolId(next);
              if (first) { setSelectedOperation(first.id); setToolInput(JSON.stringify(first.sample, null, 2)); }
            }} className="rounded-lg border border-cyan-950 bg-[#05070b] px-2 py-2 text-xs text-white">
              {usableToolIds.map(id => <option key={id} value={id}>{id === 'plugin-github-core' ? 'GitHub' : 'Google Drive'}</option>)}
            </select>
            <select value={selectedOperation} onChange={event => {
              const next = operationsByTool[selectedToolId]?.find(item => item.id === event.target.value);
              setSelectedOperation(event.target.value);
              if (next) setToolInput(JSON.stringify(next.sample, null, 2));
            }} className="min-w-56 flex-1 rounded-lg border border-cyan-950 bg-[#05070b] px-2 py-2 text-xs text-white">
              {(operationsByTool[selectedToolId] || []).map(operation => <option key={operation.id} value={operation.id}>{operation.label}</option>)}
            </select>
            <button onClick={onManageTools} className="rounded-lg border border-cyan-900 px-3 py-2 text-xs text-cyan-200">Conexiones / aprobaciones</button>
          </div>
          <textarea value={toolInput} onChange={event => setToolInput(event.target.value)} rows={3} aria-label="Entrada de la herramienta en JSON" className="w-full rounded-lg border border-cyan-950 bg-[#05070b] p-3 font-mono text-[11px] text-gray-200" />
          <div className="flex items-center justify-between gap-2"><p role="status" className="text-[10px] text-amber-200">{toolNotice || 'Las escrituras se pausan hasta que las apruebes. Los resultados quedan en el historial compartido del departamento.'}</p><button disabled={toolBusy} onClick={runTool} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{toolBusy ? 'Ejecutando…' : 'Ejecutar'}</button></div>
        </section>}

        {/* Message Viewport */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-sans">
          {usableToolIds.length > 0 && <p className="text-xs text-gray-400">Pedí lo que necesitás: el agente elegirá GitHub o Drive. Las acciones que modifican datos requieren tu aprobación aquí.</p>}
          <ChatApprovals conversationId={conversationId} refreshKey={messages.length} />
          {messages.map(msg => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-sm shrink-0 mt-1">
                    {agent.avatar || '🤖'}
                  </div>
                )}

                <div
                  className={`min-w-0 max-w-[85%] [overflow-wrap:anywhere] rounded-2xl p-4 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-cyan-500 text-black font-medium shadow-lg shadow-cyan-500/10'
                      : 'bg-[#0b101d] text-gray-200 border border-cyan-950/70 shadow-md'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Badge de derivación si hubo subordinado ejecutando */}
                  {msg.delegation && (
                    <div className="mt-3 pt-2.5 border-t border-cyan-900/40 flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-cyan-300 font-mono">
                      <span>⚡ Derivado a: <strong>{msg.delegation.assignedToAgentName}</strong></span>
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-2 text-right ${
                      isUser ? 'text-black/60 font-mono' : 'text-gray-500 font-mono'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loader de pensamiento / derivación */}
          {loading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-sm shrink-0 animate-pulse">
                {agent.avatar || '🧠'}
              </div>
              <div className="bg-[#0b101d] border border-cyan-950/80 px-4 py-3 rounded-2xl text-xs text-cyan-300 flex min-w-0 flex-wrap items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
                <span>
                  {isManager
                    ? `${agent.name} está analizando el requerimiento y coordinando especialistas...`
                    : `${agent.name} está generando la respuesta...`}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-cyan-950/60 bg-[#0b101d]/60 shrink-0">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={
                isManager
                  ? `Habla con el Manager o pídele delegar una tarea...`
                  : `Escribe un requerimiento para ${agent.name}...`
              }
              disabled={loading}
              className="min-w-0 flex-1 bg-[#05070b] border border-cyan-950 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="shrink-0 px-3 sm:px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <span>Enviar</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </button>
          </form>
          <div className="flex flex-wrap gap-2 justify-between items-center mt-2 px-1 text-[10px] text-gray-500">
            <span>Powered by iWeb Orchestrator</span>
            <span>Canal Seguro Supabase + {agent.provider.toUpperCase()}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
