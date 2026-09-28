'use client';

import React from 'react';
import { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
  subordinates?: Agent[];
  onChat: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onConfigureTelegram?: (agent: Agent) => void;
}

export default function AgentCard({
  agent,
  subordinates = [],
  onChat,
  onEdit,
  onConfigureTelegram,
}: AgentCardProps) {
  const isManager = agent.roleType === 'manager';
  const hasTelegramBot = Boolean(agent.telegramBot?.botToken);

  const getProviderBadge = (provider: Agent['provider']) => {
    switch (provider) {
      case 'claude':
        return {
          icon: '🟣',
          label: 'Claude',
          cls: 'bg-purple-950/40 text-purple-300 border-purple-800/40',
        };
      case 'openai':
        return {
          icon: '🟢',
          label: 'OpenAI',
          cls: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
        };
      case 'gemini':
        return {
          icon: '✨',
          label: 'Gemini',
          cls: 'bg-blue-950/40 text-blue-300 border-blue-800/40',
        };
      default:
        return {
          icon: '🔑',
          label: 'Custom API',
          cls: 'bg-amber-950/40 text-amber-300 border-amber-800/40',
        };
    }
  };

  const badge = getProviderBadge(agent.provider);

  return (
    <div className={`bg-[#05070b] border rounded-xl p-5 transition-all relative flex flex-col justify-between ${
      isManager 
        ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/5 hover:border-cyan-400' 
        : 'border-cyan-950/60 hover:border-cyan-800/60'
    }`}>
      {/* Header: Avatar, Rol, Provider badge */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-md border ${
              isManager 
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' 
                : 'bg-gray-900/60 border-cyan-950/80 text-gray-200'
            }`}>
              {agent.avatar || (isManager ? '🧠' : '🤖')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white text-sm">{agent.name}</h4>
              </div>
              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-mono mt-0.5 uppercase tracking-wider ${
                isManager 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold' 
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}>
                {isManager ? '👑 Manager / Orquestador' : '⚡ Agente Independiente'}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono border flex items-center gap-1 ${badge.cls}`}>
              <span>{badge.icon}</span>
              <span>{badge.label}</span>
            </span>
            <span className="text-[9px] text-gray-500 font-mono">
              {agent.model}
            </span>
          </div>
        </div>

        {/* Descripción */}
        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          {agent.description}
        </p>

        {/* Badges de Integraciones (Telegram Bot y Custom API) */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {hasTelegramBot ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-blue-950/40 text-blue-300 border border-blue-800/40 font-mono">
              <span>✈️</span>
              <span>@{agent.telegramBot?.botUsername || 'Telegram Bot'} Activo</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-gray-900/60 text-gray-500 border border-gray-800 font-mono">
              <span>✈️</span>
              <span>Sin Telegram</span>
            </span>
          )}

        </div>

        {/* Si es Manager: mostrar qué subordinados tiene a cargo */}
        {isManager && (
          <div className="mt-4 pt-3 border-t border-cyan-950/60">
            <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>👥 Agentes a su cargo ({subordinates.length})</span>
            </p>
            {subordinates.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic">Sin subordinados asignados aún</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {subordinates.map(sub => (
                  <span 
                    key={sub.id} 
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/40 text-gray-300 border border-cyan-900/50 flex items-center gap-1"
                  >
                    <span>{sub.avatar || '👤'}</span>
                    <span className="truncate max-w-[120px]">{sub.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-5 pt-3 border-t border-cyan-950/40 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-[10px] text-gray-400 uppercase font-mono">Online</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Botón para Configurar Bot de Telegram de BotFather */}
          {onConfigureTelegram && (
            <button
              onClick={() => onConfigureTelegram(agent)}
              className={`p-1.5 rounded-lg text-xs transition-all border ${
                hasTelegramBot
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                  : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
              }`}
              title={hasTelegramBot ? 'Gestionar Bot de Telegram' : 'Crear Bot de Telegram con BotFather'}
            >
              ✈️
            </button>
          )}

          {/* Botón Editar */}
          {onEdit && (
            <button
              onClick={() => onEdit(agent)}
              className="p-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all"
              title="Editar configuración"
            >
              ⚙️
            </button>
          )}

          {/* Botón Consultar / Hablar */}
          <button
            onClick={() => onChat(agent)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
              isManager
                ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20'
                : 'bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60'
            }`}
          >
            <span>💬</span>
            <span>{isManager ? 'Manager' : 'Hablar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
