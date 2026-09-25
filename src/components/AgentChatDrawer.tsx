'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Agent, ChatMessage, AgentActivityLog } from '@/types';
import { supabase } from '@/lib/supabase';

interface AgentChatDrawerProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  availableAgents: Agent[];
  onNewLog: (log: AgentActivityLog) => void;
}

export default function AgentChatDrawer({
  isOpen,
  agent,
  onClose,
  availableAgents,
  onNewLog,
}: AgentChatDrawerProps) {
  const isManager = agent?.roleType === 'manager';
  const subordinates = agent ? availableAgents.filter(a => agent.subordinateIds?.includes(a.id)) : [];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agent) return;
    // Inicializar con mensaje de bienvenida del agente
    if (messages.length === 0) {
      const welcome: ChatMessage = {
        id: `msg-${Date.now()}`,
        agentId: agent.id,
        role: 'assistant',
        content: isManager
          ? `👋 Hola, soy **${agent.name}**, Manager y Orquestador. Tengo a mi cargo a **${subordinates.length} especialistas** (${subordinates.map(s => s.name).join(', ')}). Cuéntame tu objetivo y me encargaré de coordinar la solución o delegarla a quien corresponda.`
          : `👋 Hola, soy **${agent.name}**. ¿En qué puedo ayudarte hoy dentro de mi especialidad?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([welcome]);
    }
  }, [agent?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
          message: userMsgText,
          chatHistory: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al comunicarse con el agente');
      }

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

  if (!isOpen || !agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#080c14] border-l border-cyan-950/80 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Top Header */}
        <div className="h-20 px-6 border-b border-cyan-950/60 bg-[#0b101d]/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${
              isManager 
                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300' 
                : 'bg-gray-900 border-gray-800 text-gray-200'
            }`}>
              {agent.avatar || (isManager ? '👑' : '🤖')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base leading-tight">{agent.name}</h3>
                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-mono font-bold ${
                  isManager 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {isManager ? 'Manager' : 'Especialista'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                <span className="text-cyan-400 font-mono">[{agent.model}]</span>
                <span>•</span>
                <span className="text-emerald-400">● Conectado</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Banner informativo de subordinados si es Manager */}
        {isManager && subordinates.length > 0 && (
          <div className="px-6 py-2.5 bg-cyan-950/20 border-b border-cyan-950/60 flex items-center justify-between text-xs">
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

        {/* Message Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans">
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
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-cyan-500 text-black font-medium shadow-lg shadow-cyan-500/10'
                      : 'bg-[#0b101d] text-gray-200 border border-cyan-950/70 shadow-md'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Badge de derivación si hubo subordinado ejecutando */}
                  {msg.delegation && (
                    <div className="mt-3 pt-2.5 border-t border-cyan-900/40 flex items-center gap-2 text-[10px] text-cyan-300 font-mono">
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
              <div className="bg-[#0b101d] border border-cyan-950/80 px-4 py-3 rounded-2xl text-xs text-cyan-300 flex items-center gap-2">
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
              className="flex-1 bg-[#05070b] border border-cyan-950 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <span>Enviar</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </button>
          </form>
          <div className="flex justify-between items-center mt-2 px-1 text-[10px] text-gray-500">
            <span>Powered by iWeb Orchestrator</span>
            <span>Canal Seguro Supabase + {agent.provider.toUpperCase()}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
