'use client';

import React, { useState } from 'react';
import { UserSubscription } from '@/types';
import { supabase } from '@/lib/supabase';

type Provider = UserSubscription['provider'];

interface OAuthSubscriptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  subscriptions: UserSubscription[];
  onConnectionChange: (provider: Provider, connected: boolean, connectedAt?: string) => void;
}

const providerInfo: Record<Provider, { title: string; icon: string; color: string; description: string }> = {
  openai: {
    title: 'OpenAI Platform',
    icon: '🟢',
    color: 'emerald',
    description: 'Usa una API key de OpenAI Platform. ChatGPT Pro no incluye crédito para la API; la conexión de Codex por suscripción se validará aparte.',
  },
  gemini: {
    title: 'Gemini API',
    icon: '✨',
    color: 'cyan',
    description: 'Usa una API key de Gemini API con su propia cuota y facturación. La suscripción Google AI Pro no se reutiliza desde Jetree.',
  },
  claude: {
    title: 'Anthropic API',
    icon: '🟣',
    color: 'purple',
    description: 'Usa una API key de Anthropic Console. El inicio de sesión de Claude Pro/Max no se conecta ni se almacena en Jetree.',
  },
  custom: {
    title: 'Otros modelos (OpenRouter)',
    icon: '🔑',
    color: 'amber',
    description: 'Conecta tu API key de OpenRouter y elegí el ID del modelo al configurar cada agente.',
  },
};

const providers: Provider[] = ['openai', 'claude', 'gemini', 'custom'];

export default function OAuthSubscriptionsModal({
  isOpen,
  onClose,
  userEmail,
  subscriptions,
  onConnectionChange,
}: OAuthSubscriptionsModalProps) {
  const [apiKeys, setApiKeys] = useState<Partial<Record<Provider, string>>>({});
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [feedback, setFeedback] = useState<{ provider: Provider; message: string; error?: boolean } | null>(null);

  if (!isOpen) return null;

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Iniciá sesión para administrar conexiones.');
    return { Authorization: `Bearer ${data.session.access_token}` };
  };

  const saveConnection = async (provider: Provider) => {
    const apiKey = apiKeys[provider]?.trim();
    if (!apiKey) {
      setFeedback({ provider, message: 'Ingresá una API key para guardar la conexión.', error: true });
      return;
    }

    setBusyProvider(provider);
    setFeedback(null);
    try {
      const response = await fetch('/api/provider-connections', {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la conexión.');
      setApiKeys(current => ({ ...current, [provider]: '' }));
      onConnectionChange(provider, true, payload.connection?.connected_at);
      setFeedback({ provider, message: 'API key cifrada y guardada. Jetree la usará solo en ejecuciones de tu usuario.' });
    } catch (error) {
      setFeedback({ provider, message: error instanceof Error ? error.message : 'No se pudo guardar la conexión.', error: true });
    } finally {
      setBusyProvider(null);
    }
  };

  const disconnect = async (provider: Provider) => {
    setBusyProvider(provider);
    setFeedback(null);
    try {
      const response = await fetch(`/api/provider-connections?provider=${provider}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo revocar la conexión.');
      onConnectionChange(provider, false);
      setFeedback({ provider, message: 'Conexión revocada y credencial eliminada.' });
    } catch (error) {
      setFeedback({ provider, message: error instanceof Error ? error.message : 'No se pudo revocar la conexión.', error: true });
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-2xl border border-cyan-950/80 bg-[#080c14] p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-cyan-950/60 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <span>🔐</span> Conexiones de modelos
            </h3>
            <p className="mt-1 text-xs text-gray-400">Configurá credenciales API propias para {userEmail}.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-800 bg-gray-900 text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-3.5">
          {providers.map(provider => {
            const connection = subscriptions.find(item => item.provider === provider);
            const info = providerInfo[provider];
            const busy = busyProvider === provider;
            return (
              <section key={provider} className={`space-y-3 rounded-xl border p-4 ${connection?.connected ? 'border-emerald-700/40 bg-emerald-950/10' : 'border-cyan-950/60 bg-[#05070b]'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-800 bg-gray-900/80 text-xl">{info.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{info.title}</h4>
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${connection?.connected ? 'border-emerald-800/40 bg-emerald-950/40 text-emerald-400' : 'border-gray-800 bg-gray-900 text-gray-500'}`}>
                        {connection?.connected ? 'API key guardada' : 'Sin configurar'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">{info.description}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    autoComplete="off"
                    value={apiKeys[provider] || ''}
                    onChange={event => setApiKeys(current => ({ ...current, [provider]: event.target.value }))}
                    placeholder={connection?.connected ? 'Ingresá una nueva key para reemplazarla' : 'API key'}
                    aria-label={`API key de ${info.title}`}
                    className="min-w-0 flex-1 rounded-lg border border-cyan-950/80 bg-[#080c14] px-3 py-2 font-mono text-xs text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !(apiKeys[provider] || '').trim()}
                    onClick={() => saveConnection(provider)}
                    className="rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? 'Guardando…' : connection?.connected ? 'Reemplazar key' : 'Guardar key'}
                  </button>
                  {connection?.connected && (
                    <button type="button" disabled={busy} onClick={() => disconnect(provider)} className="rounded-lg border border-red-800/50 px-3.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-40">
                      Revocar
                    </button>
                  )}
                </div>
                {feedback?.provider === provider && (
                  <p role="status" className={`text-xs ${feedback.error ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback.message}</p>
                )}
              </section>
            );
          })}
        </div>

        <div className="rounded-xl border border-cyan-950/60 bg-cyan-950/10 p-3 text-xs leading-relaxed text-gray-400">
          Las claves se cifran en el servidor y la interfaz nunca vuelve a recibirlas. Guardar una key confirma que quedó almacenada, no que el proveedor ya la validó.
        </div>
        <div className="flex justify-end border-t border-cyan-950/60 pt-3">
          <button onClick={onClose} className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
