'use client';

import React, { useState } from 'react';
import { UserSubscription } from '@/types';

interface OAuthSubscriptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  subscriptions: UserSubscription[];
  onToggleSubscription: (provider: 'openai' | 'gemini' | 'claude') => void;
}

export default function OAuthSubscriptionsModal({
  isOpen,
  onClose,
  userEmail,
  subscriptions,
  onToggleSubscription,
}: OAuthSubscriptionsModalProps) {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = (provider: 'openai' | 'gemini' | 'claude') => {
    setConnectingProvider(provider);
    // A provider connection is only marked active after a server-side callback.
    // The current UI intentionally does not fabricate an OAuth success state.
    setTimeout(() => setConnectingProvider(null), 400);
  };

  const getProviderInfo = (provider: 'openai' | 'gemini' | 'claude') => {
    switch (provider) {
      case 'openai':
        return {
          title: 'OpenAI (ChatGPT Pro / Plus)',
          icon: '🟢',
          color: 'emerald',
          desc: 'Habilita GPT-4o, GPT-4o-mini y capacidades avanzadas de razonamiento.',
          defaultTier: 'ChatGPT Pro / Team',
        };
      case 'gemini':
        return {
          title: 'Google Gemini Pro / Advanced',
          icon: '✨',
          color: 'cyan',
          desc: 'Habilita Gemini 2.5 Flash, Gemini 1.5 Pro y multimodalidad de Google Cloud.',
          defaultTier: 'Gemini Advanced (Google One AI)',
        };
      case 'claude':
        return {
          title: 'Anthropic Claude Pro / Team',
          icon: '🟣',
          color: 'purple',
          desc: 'Habilita Claude 3.5 Sonnet, Claude 3.5 Haiku y síntesis profunda.',
          defaultTier: 'Claude Pro Account',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#080c14] border border-cyan-950/80 rounded-2xl max-w-xl w-full shadow-2xl p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-950/60 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔐</span>
              <span>Conectar Suscripciones de IA (OAuth)</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Vincula tus cuentas profesionales para habilitar sus modelos en tus agentes y departamentos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Info Usuario */}
        <div className="p-3 bg-cyan-950/20 border border-cyan-900/40 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-gray-300">Usuario activo: <strong>{userEmail}</strong></span>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono">Workspace Seguro</span>
        </div>

        {/* Lista de Proveedores OAuth */}
        <div className="space-y-3.5">
          {(['gemini', 'openai', 'claude'] as const).map(provider => {
            const sub = subscriptions.find(s => s.provider === provider);
            const isConnected = sub?.connected || false;
            const info = getProviderInfo(provider);
            const isConnecting = connectingProvider === provider;

            return (
              <div
                key={provider}
                className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                  isConnected
                    ? 'bg-cyan-950/15 border-cyan-500/30'
                    : 'bg-[#05070b] border-cyan-950/60 hover:border-cyan-900/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-900/80 border border-gray-800 flex items-center justify-center text-xl shrink-0">
                    {info.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white text-sm">{info.title}</h4>
                      {isConnected ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono font-medium">
                          ✓ Conectado ({sub?.tier || 'Pro'})
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-mono">
                          No vinculado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{info.desc}</p>
                    {isConnected && sub?.connectedAt && (
                      <p className="text-[10px] text-gray-500 font-mono mt-1">
                        Vinculado: {new Date(sub.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => handleConnect(provider)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                    isConnected
                      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/20'
                  }`}
                >
                  {isConnecting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-black animate-ping"></span>
                      Autenticando...
                    </span>
                  ) : isConnected ? (
                    'Desconectar'
                  ) : (
                    'Iniciar con OAuth'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-cyan-950/60 flex items-center justify-between text-xs text-gray-400">
          <span>Tus suscripciones solo se usan para tus agentes asignados.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-medium transition-all"
          >
            Listo
          </button>
        </div>

      </div>
    </div>
  );
}
