'use client';

import React, { useEffect, useState } from 'react';
import { Agent } from '@/types';
import { supabase } from '@/lib/supabase';

interface TelegramBotModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  onSaveBotConfig: (agentId: string, botUsername: string) => void;
}

export default function TelegramBotModal({
  isOpen,
  agent,
  onClose,
  onSaveBotConfig,
}: TelegramBotModalProps) {
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState(agent?.telegramBot?.botUsername || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [pairCommand, setPairCommand] = useState('');
  const [toolChatLinked, setToolChatLinked] = useState(false);
  const [canLinkTools, setCanLinkTools] = useState(false);

  useEffect(() => {
    setBotToken('');
    setBotUsername(agent?.telegramBot?.botUsername || '');
    setStatusMsg('');
    setPairCommand('');
    setToolChatLinked(false);
    setCanLinkTools(false);
  }, [agent?.id, agent?.telegramBot?.botUsername]);

  useEffect(() => {
    if (!isOpen || !agent) { setPairCommand(''); return; }
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/agents/${agent.id}/telegram`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
      const payload = await res.json();
      if (active && res.ok) { setToolChatLinked(Boolean(payload.telegramBot?.toolChatLinked)); setCanLinkTools(Boolean(payload.telegramBot?.canLinkTools)); }
    })().catch(() => {});
    return () => { active = false; };
  }, [isOpen, agent]);

  const handleToolChat = async (action: 'link_tools' | 'unlink_tools') => {
    if (!agent) return;
    setIsVerifying(true); setPairCommand('');
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/agents/${agent.id}/telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify({ action }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'No se pudo autorizar el chat.');
      if (action === 'link_tools') { setPairCommand(payload.command); setStatusMsg('Mandá el comando al bot en tu chat privado. Vence en 10 minutos y sirve una sola vez.'); }
      else { setToolChatLinked(false); setStatusMsg('Acceso a herramientas desde Telegram revocado.'); }
    } catch (err: any) { setStatusMsg(`❌ ${err.message || 'No se pudo autorizar el chat.'}`); }
    finally { setIsVerifying(false); }
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook/telegram/${agent?.id || ''}`
    : `https://tu-dominio.com/api/webhook/telegram/${agent?.id || ''}`;

  const handleRegisterWebhook = async () => {
    if (!botToken.trim() || !agent) {
      setStatusMsg('❌ Por favor ingresa el token de BotFather.');
      return;
    }

    setIsVerifying(true);
    setStatusMsg('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Inicia sesión de nuevo para conectar el bot.');
      const res = await fetch(`/api/agents/${agent.id}/telegram`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'No se pudo conectar el bot.');
      const username = payload.telegramBot.botUsername || botUsername.trim();
      setBotUsername(username);
      setBotToken('');
      setStatusMsg('✅ Bot conectado y webhook protegido registrado.');
      onSaveBotConfig(agent.id, username);
      setCanLinkTools(true);
      setToolChatLinked(false);
      setPairCommand('');
    } catch (err: any) {
      setStatusMsg(`❌ ${err.message || 'No se pudo conectar el bot.'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (!agent) return;
    setIsVerifying(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/agents/${agent.id}/telegram`, { method: 'DELETE', headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'No se pudo desconectar el bot.');
      onSaveBotConfig(agent.id, '');
      setBotUsername('');
      setStatusMsg('Bot desconectado.');
    } catch (err: any) {
      setStatusMsg(`❌ ${err.message || 'No se pudo desconectar el bot.'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen || !agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#080c14] border border-cyan-950/80 rounded-2xl max-w-xl w-full max-h-[90dvh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-950/60 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>✈️</span>
              <span>Bot de Telegram para {agent.name}</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Conecta este agente directamente a un bot de Telegram creado en @BotFather
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Info del Agente */}
        <div className="p-3 bg-cyan-950/20 border border-cyan-900/40 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">{agent.avatar || '🤖'}</span>
            <div>
              <p className="font-semibold text-white">{agent.name}</p>
              <p className="text-[10px] text-cyan-400 font-mono">
                {agent.roleType === 'manager' ? '👑 Manager / Orquestador' : '⚡ Agente Especialista'} • {agent.model}
              </p>
            </div>
          </div>
          {agent.telegramBot?.isActive && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono">
              ● Bot Conectado
            </span>
          )}
        </div>

        {/* Paso a paso de BotFather */}
        <div className="bg-[#05070b] border border-cyan-950/70 p-4 rounded-xl space-y-2 text-xs text-gray-300 leading-relaxed">
          <p className="font-semibold text-white flex items-center gap-1.5">
            <span>📋</span>
            <span>¿Cómo obtener el token en Telegram?</span>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1 text-[11px]">
            <li>Abre Telegram y busca <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">@BotFather</a>.</li>
            <li>Envía el comando <code className="text-cyan-300 bg-cyan-950/40 px-1 rounded">/newbot</code>.</li>
            <li>Asígnale un nombre (ej. <em>{agent.name}</em>) y un usuario único terminado en <code>bot</code>.</li>
            <li>Copia el <strong>HTTP API Token</strong> generado y pégalo aquí abajo:</li>
          </ol>
        </div>

        {/* Inputs */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Telegram Bot Token (de @BotFather)
            </label>
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder={agent.telegramBot?.isActive ? 'Token protegido. Pega uno nuevo para reemplazarlo.' : 'Pega el token de @BotFather'}
              className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-mono transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Username del Bot (Opcional)
            </label>
            <div className="flex items-center">
              <span className="bg-[#05070b] border border-r-0 border-cyan-950 rounded-l-xl px-3 py-2.5 text-xs text-gray-500 font-mono">
                @
              </span>
              <input
                type="text"
                value={botUsername.replace('@', '')}
                onChange={e => setBotUsername(e.target.value.replace('@', ''))}
                placeholder="MiAgenteBot"
                className="w-full bg-[#05070b] border border-cyan-950 rounded-r-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-mono transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Webhook Endpoint Asignado
            </label>
            <div className="p-2.5 bg-[#05070b] border border-cyan-950/80 rounded-lg text-[11px] font-mono text-cyan-400 truncate">
              {webhookUrl}
            </div>
          </div>
        </div>

        {/* Feedback / Status */}
        {agent.telegramBot?.isActive && <section className="p-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 space-y-3 text-xs text-gray-300">
          <h4 className="font-semibold text-white">Herramientas y aprobaciones por Telegram</h4>
          <p>Vinculá tu chat privado para usar las herramientas habilitadas del agente. Cada envío, respuesta o cambio mostrará su detalle y botones para aprobar o rechazar en Telegram.</p>
          <p>{toolChatLinked ? 'Chat autorizado. Podés aprobar acciones desde Telegram.' : 'Sin chat autorizado para herramientas.'}</p>
          {canLinkTools && <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isVerifying} onClick={() => handleToolChat('link_tools')} className="px-3 py-2 bg-cyan-500 text-black rounded-lg font-semibold">{toolChatLinked ? 'Vincular otro chat' : 'Vincular mi chat para herramientas'}</button>
            {toolChatLinked && <button type="button" disabled={isVerifying} onClick={() => handleToolChat('unlink_tools')} className="px-3 py-2 bg-gray-800 rounded-lg">Revocar acceso del chat</button>}
          </div>}
          {!canLinkTools && <p>La vinculación la administra el propietario del bot.</p>}
          {pairCommand && <div className="space-y-2"><p>No compartas este comando: autoriza tu cuenta de Telegram para acceder a las herramientas conectadas en Jetree.</p><code className="block break-all p-3 rounded-lg bg-black text-cyan-300 select-all">{pairCommand}</code></div>}
        </section>}
        {statusMsg && (
          <div className="p-3 bg-cyan-950/30 border border-cyan-900/60 rounded-xl text-xs text-gray-200">
            {statusMsg}
          </div>
        )}

        {/* Acciones */}
        <div className="pt-3 border-t border-cyan-950/60 flex items-center justify-between gap-3">
          {botUsername && (
            <a
              href={`https://t.me/${botUsername.replace('@', '')}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-mono"
            >
              <span>Abrir @{botUsername.replace('@', '')} en Telegram ↗</span>
            </a>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {agent.telegramBot?.isActive && <button type="button" disabled={isVerifying} onClick={handleDisconnect} className="px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-medium">Desconectar</button>}
            <button
              type="button"
              disabled={isVerifying || !botToken.trim()}
              onClick={handleRegisterWebhook}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>✈️</span>
              <span>{isVerifying ? 'Vinculando...' : 'Conectar Bot'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
