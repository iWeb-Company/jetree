'use client';

import React from 'react';
import { AgentActivityLog } from '@/types';

interface LiveMonitorFeedProps {
  logs: AgentActivityLog[];
  onClearLogs?: () => void;
}

export default function LiveMonitorFeed({ logs, onClearLogs }: LiveMonitorFeedProps) {
  const getBadgeStyle = (type: AgentActivityLog['type']) => {
    switch (type) {
      case 'telegram_in':
        return 'bg-blue-950/40 text-blue-400 border-blue-800/40';
      case 'manager_analysis':
        return 'bg-purple-950/40 text-purple-300 border-purple-800/40';
      case 'delegated':
        return 'bg-cyan-950/40 text-cyan-300 border-cyan-800/40';
      case 'agent_executing':
        return 'bg-amber-950/40 text-amber-300 border-amber-800/40';
      case 'completed':
        return 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40';
      case 'error':
        return 'bg-red-950/40 text-red-300 border-red-800/40';
      default:
        return 'bg-gray-900 text-gray-300 border-gray-700';
    }
  };

  const getIcon = (type: AgentActivityLog['type']) => {
    switch (type) {
      case 'telegram_in':
        return '📬';
      case 'manager_analysis':
        return '🧠';
      case 'delegated':
        return '⚡';
      case 'agent_executing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📡';
    }
  };

  return (
    <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-cyan-950/40 bg-[#080c14]/40 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
          <div>
            <h3 className="text-base font-semibold text-white">Consola de Monitoreo & Logs en Vivo</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Trazabilidad en tiempo real de Telegram, Managers y Agentes Especialistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs bg-cyan-950/50 text-cyan-300 px-3 py-1 rounded-md border border-cyan-800/40 font-mono">
            {logs.length} eventos
          </span>
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-cyan-950 hover:bg-gray-900 transition-all"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Feed List */}
      <div className="p-6 space-y-3 font-mono">
        {logs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-cyan-950/60 rounded-xl bg-cyan-950/5 text-gray-500 text-xs">
            Aún no hay actividad registrada. Envía un mensaje por Telegram o conversa con un Agente/Manager para generar eventos.
          </div>
        ) : (
          logs.map(log => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={log.id}
                className="p-3.5 rounded-lg bg-[#05070b] border border-cyan-950/50 hover:border-cyan-800/50 transition-all flex items-start justify-between gap-4 text-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">{getIcon(log.type)}</span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider font-bold ${getBadgeStyle(log.type)}`}>
                        {log.type.replace('_', ' ')}
                      </span>
                      {log.agentName && (
                        <span className="text-cyan-300 font-medium">
                          [{log.agentName}]
                        </span>
                      )}
                      {log.targetAgentName && (
                        <span className="text-gray-400">
                          ➜ derivado a <strong className="text-emerald-400">{log.targetAgentName}</strong>
                        </span>
                      )}
                    </div>
                    <p className="text-gray-200 font-sans text-xs leading-relaxed">
                      {log.message}
                    </p>
                    {log.details && (
                      <p className="text-[11px] text-gray-400 font-sans italic bg-cyan-950/20 p-2 rounded border border-cyan-900/30">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-gray-500 whitespace-nowrap">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
