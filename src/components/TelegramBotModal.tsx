'use client';

import React, { useState } from 'react';
import { Agent } from '@/types';

interface TelegramBotModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  onSaveBotConfig: (agentId: string, botToken: string, botUsername: string) => void;
}

export default function TelegramBotModal({
  isOpen,
  agent,
  onClose,
  onSaveBotConfig,
}: TelegramBotModalProps) {
  const [botToken, setBotToken] = useState(agent?.telegramBot?.botToken || '');
  const [botUsername, setBotUsername] = useState(agent?.telegramBot?.botUsername || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Webhook URL calculada para este agente
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
      // Registrar webhook directamente contra la Telegram Bot API
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });

      const data = await res.json();

      if (data.ok) {
        setStatusMsg('✅ ¡Webhook registrado con éxito en Telegram! El bot ya está activo.');
        onSaveBotConfig(agent.id, botToken.trim(), botUsername.trim());
      } else {
        setStatusMsg(`❌ Error de Telegram: ${data.description || 'Token inválido'}`);
      }
    } catch (err: any) {
      // Si falla por CORS en navegador local, guardar igualmente y dar instrucciones
      setStatusMsg(`ℹ️ Configuración guardada. Para completar el enlace del webhook en producción: visita https://api.telegram.org/bot${botToken.trim()}/setWebhook?url=${webhookUrl}`);
      onSaveBotConfig(agent.id, botToken.trim(), botUsername.trim());
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveOnly = () => {
    if (!botToken.trim() || !agent) return;
    onSaveBotConfig(agent.id, botToken.trim(), botUsername.trim());
    setStatusMsg('✅ Token guardado en la configuración del agente.');
    setTimeout(() => onClose(), 800);
  };

  if (!isOpen || !agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#080c14] border border-cyan-950/80 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
        
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
              placeholder="1234567890:AAHdqTcvCH1vGWJxfUks..."
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
            <button
              type="button"
              onClick={handleSaveOnly}
              className="px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-medium transition-all"
            >
              Guardar Token
            </button>
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
