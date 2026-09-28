'use client';

import React, { useState, useMemo } from 'react';
import { Agent, Department, AgentRoleType, AIProvider, UserSubscription } from '@/types';
import { ALL_CHATGPT_WORK_PLUGINS, PLUGIN_CATEGORIES, PluginCategory } from '@/lib/agents/plugins';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: Agent) => void;
  departments: Department[];
  existingAgents: Agent[];
  userSubscriptions: UserSubscription[];
  agentToEdit?: Agent | null;
  onOpenSubscriptions?: () => void;
}

export default function AgentModal({
  isOpen,
  onClose,
  onSave,
  departments,
  existingAgents,
  userSubscriptions,
  agentToEdit,
  onOpenSubscriptions,
}: AgentModalProps) {
  const [name, setName] = useState(agentToEdit?.name || '');
  const [description, setDescription] = useState(agentToEdit?.description || '');
  const [departmentId, setDepartmentId] = useState(agentToEdit?.departmentId || departments[0]?.id || 'ai-dev');
  const [roleType, setRoleType] = useState<AgentRoleType>(agentToEdit?.roleType || 'independent');
  const [provider, setProvider] = useState<AIProvider>(agentToEdit?.provider || 'gemini');
  const [model, setModel] = useState(agentToEdit?.model || 'gemini-2.5-flash');
  const [systemPrompt, setSystemPrompt] = useState(
    agentToEdit?.systemPrompt || 'Eres un asistente especialista en...'
  );
  const [avatar, setAvatar] = useState(agentToEdit?.avatar || (roleType === 'manager' ? '👨‍💼' : '🤖'));
  const [selectedSubordinates, setSelectedSubordinates] = useState<string[]>(
    agentToEdit?.subordinateIds || []
  );
  const [enabledPluginIds, setEnabledPluginIds] = useState<string[]>(
    agentToEdit?.enabledPluginIds || ALL_CHATGPT_WORK_PLUGINS.filter(p => p.enabledByDefault).map(p => p.id)
  );

  // Pestaña interna del modal: 'general' o 'plugins'
  const [modalTab, setModalTab] = useState<'general' | 'plugins'>('general');

  // Filtros del explorador de Plugins
  const [pluginCategoryFilter, setPluginCategoryFilter] = useState<string>('all');
  const [pluginSearchQuery, setPluginSearchQuery] = useState('');

  // Filtrado reactivo de plugins según categoría y búsqueda
  const filteredPlugins = useMemo(() => {
    return ALL_CHATGPT_WORK_PLUGINS.filter(p => {
      const matchCat = pluginCategoryFilter === 'all' || p.category === pluginCategoryFilter;
      const matchQuery = !pluginSearchQuery.trim() ||
        p.name.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(pluginSearchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [pluginCategoryFilter, pluginSearchQuery]);

  if (!isOpen) return null;

  // Verificar suscripción conectada
  const isSubscribed = (prov: AIProvider) => {
    return userSubscriptions.some(s => s.provider === prov && s.connected);
  };

  const getModelOptions = (prov: AIProvider) => {
    switch (prov) {
      case 'gemini':
        return [
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Ultrarrápido & Multimodal)' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Razonamiento Complejo & Gran Contexto)' },
        ];
      case 'openai':
        return [
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Rápido y Óptimo)' },
          { value: 'gpt-4o', label: 'GPT-4o (Máxima Capacidad & Razonamiento)' },
        ];
      case 'claude':
        return [
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Excelente en Código y Matices)' },
          { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Velocidad & Eficiencia)' },
        ];
      case 'custom':
        return [{ value: 'custom-model', label: 'Escribí el ID del modelo de OpenRouter abajo' }];
    }
  };

  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    const options = getModelOptions(newProvider);
    setModel(options[0].value);
  };

  const handleSubordinateToggle = (id: string) => {
    if (selectedSubordinates.includes(id)) {
      setSelectedSubordinates(selectedSubordinates.filter(s => s !== id));
    } else {
      setSelectedSubordinates([...selectedSubordinates, id]);
    }
  };

  const handlePluginToggle = (id: string) => {
    if (enabledPluginIds.includes(id)) {
      setEnabledPluginIds(enabledPluginIds.filter(p => p !== id));
    } else {
      setEnabledPluginIds([...enabledPluginIds, id]);
    }
  };

  const handleSelectAllFilteredPlugins = () => {
    const idsToAdd = filteredPlugins.map(p => p.id);
    const set = new Set([...enabledPluginIds, ...idsToAdd]);
    setEnabledPluginIds(Array.from(set));
  };

  const handleDeselectAllPlugins = () => {
    setEnabledPluginIds([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (provider === 'custom' && (!model.trim() || model === 'custom-model'))) return;

    const newAgent: Agent = {
      id: agentToEdit?.id || `agent-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      departmentId,
      roleType,
      subordinateIds: roleType === 'manager' ? selectedSubordinates : undefined,
      provider,
      model,
      systemPrompt: systemPrompt.trim(),
      enabledPluginIds,
      telegramBot: agentToEdit?.telegramBot,
      status: 'idle',
      avatar,
      createdAt: agentToEdit?.createdAt || new Date().toISOString(),
    };

    onSave(newAgent);
    onClose();
  };

  const availablePotentialSubordinates = existingAgents.filter(
    a => a.id !== agentToEdit?.id && a.departmentId === departmentId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#080c14] border border-cyan-950/80 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
        
        {/* Header Modal con tabs de navegación */}
        <div className="flex items-center justify-between border-b border-cyan-950/60 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{avatar}</span>
              <span>{agentToEdit ? 'Editar Agente / Manager' : 'Crear Nuevo Agente de IA'}</span>
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setModalTab('general')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  modalTab === 'general'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                ⚙️ Configuración General
              </button>
              <button
                type="button"
                onClick={() => setModalTab('plugins')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  modalTab === 'plugins'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🧩 Catálogo Completo de Plugins & Skills ({ALL_CHATGPT_WORK_PLUGINS.length})</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/30 text-cyan-200 font-mono">
                  {enabledPluginIds.length} activos
                </span>
              </button>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {modalTab === 'general' ? (
            <>
              {/* Nombre y Avatar */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Nombre del Agente
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Lucas Silva (Marketing Specialist)"
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Icono / Avatar
                  </label>
                  <input
                    type="text"
                    value={avatar}
                    onChange={e => setAvatar(e.target.value)}
                    placeholder="🤖"
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-center text-white focus:outline-none focus:border-cyan-500 transition-all"
                  />
                </div>
              </div>

              {/* Departamento y Tipo de Rol (Manager vs Independiente) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Departamento
                  </label>
                  <select
                    value={departmentId}
                    onChange={e => setDepartmentId(e.target.value)}
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Tipo de Agente
                  </label>
                  <select
                    value={roleType}
                    onChange={e => {
                      const newRole = e.target.value as AgentRoleType;
                      setRoleType(newRole);
                      if (newRole === 'manager' && avatar === '🤖') setAvatar('👨‍💼');
                    }}
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all"
                  >
                    <option value="independent">⚡ Agente Independiente</option>
                    <option value="manager">👑 Manager / Orquestador</option>
                  </select>
                </div>
              </div>

              {/* Si es Manager: selección de subordinados a su cargo */}
              {roleType === 'manager' && (
                <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                      Agentes a cargo para derivación
                    </label>
                    <span className="text-[10px] text-gray-400">
                      {selectedSubordinates.length} asignados
                    </span>
                  </div>
                  
                  {availablePotentialSubordinates.length === 0 ? (
                    <p className="text-xs text-amber-400/80 italic py-1">
                      ⚠️ No hay otros agentes en este departamento todavía.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {availablePotentialSubordinates.map(sub => (
                        <label 
                          key={sub.id} 
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-[#05070b] border border-cyan-950/60 hover:border-cyan-800 cursor-pointer text-xs text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSubordinates.includes(sub.id)}
                            onChange={() => handleSubordinateToggle(sub.id)}
                            className="rounded accent-cyan-500"
                          />
                          <span>{sub.avatar || '🤖'}</span>
                          <span className="font-medium">{sub.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Proveedor de IA */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Proveedor de IA
                  </label>
                  {onOpenSubscriptions && (
                    <button
                      type="button"
                      onClick={onOpenSubscriptions}
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <span>🔐</span>
                      <span>Gestionar conexiones</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleProviderChange('gemini')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all text-left flex flex-col justify-between ${
                      provider === 'gemini'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-sm'
                        : 'bg-[#05070b] text-gray-400 border-cyan-950 hover:border-cyan-900'
                    }`}
                  >
                    <span className="font-semibold text-white flex items-center gap-1">✨ Gemini Pro</span>
                    <span className={`text-[9px] mt-1 font-mono ${isSubscribed('gemini') ? 'text-cyan-400' : 'text-gray-500'}`}>
                      {isSubscribed('gemini') ? '● API configurada' : 'Configurar API'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProviderChange('openai')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all text-left flex flex-col justify-between ${
                      provider === 'openai'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-sm'
                        : 'bg-[#05070b] text-gray-400 border-cyan-950 hover:border-cyan-900'
                    }`}
                  >
                    <span className="font-semibold text-white flex items-center gap-1">🟢 OpenAI</span>
                    <span className={`text-[9px] mt-1 font-mono ${isSubscribed('openai') ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {isSubscribed('openai') ? '● API configurada' : 'Configurar API'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProviderChange('claude')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all text-left flex flex-col justify-between ${
                      provider === 'claude'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-sm'
                        : 'bg-[#05070b] text-gray-400 border-cyan-950 hover:border-cyan-900'
                    }`}
                  >
                    <span className="font-semibold text-white flex items-center gap-1">🟣 Claude Pro</span>
                    <span className={`text-[9px] mt-1 font-mono ${isSubscribed('claude') ? 'text-purple-400' : 'text-gray-500'}`}>
                      {isSubscribed('claude') ? '● API configurada' : 'Configurar API'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProviderChange('custom')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all text-left flex flex-col justify-between ${
                      provider === 'custom'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm'
                        : 'bg-[#05070b] text-gray-400 border-cyan-950 hover:border-cyan-900'
                    }`}
                  >
                    <span className="font-semibold text-white flex items-center gap-1">🔑 OpenRouter</span>
                    <span className={`text-[9px] mt-1 font-mono ${isSubscribed('custom') ? 'text-amber-400' : 'text-gray-500'}`}>
                      {isSubscribed('custom') ? '● OpenRouter configurado' : 'Configurar OpenRouter'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Selector de Modelo Específico */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Modelo Específico
                </label>
                {provider === 'custom' ? (
                  <input
                    required
                    value={model === 'custom-model' ? '' : model}
                    onChange={event => setModel(event.target.value)}
                    placeholder="ej. deepseek/deepseek-chat-v3.1"
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                ) : (
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all font-mono"
                  >
                    {getModelOptions(provider).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Descripción del Rol
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ej. Experto en UX/UI, análisis heurístico y prototipado"
                  className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Instrucciones del Sistema (System Prompt)
                </label>
                <textarea
                  rows={3}
                  required
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="Describe detalladamente el comportamiento y directivas..."
                  className="w-full bg-[#05070b] border border-cyan-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all font-mono leading-relaxed"
                />
              </div>
            </>
          ) : (
            /* PESTAÑA DE PLUGINS & SKILLS COMPLETO ESTILO CHATGPT WORK */
            <div className="space-y-4">
              
              {/* Header con Buscador y Filtros por Categoría */}
              <div className="p-4 bg-[#05070b] border border-cyan-950 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>🧩</span>
                      <span>Plugins & Integraciones de ChatGPT Work</span>
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Work with ChatGPT & AI across your favorite tools. Auto-detectado para todos los modelos.
                    </p>
                  </div>
                  
                  {/* Buscador */}
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      value={pluginSearchQuery}
                      onChange={e => setPluginSearchQuery(e.target.value)}
                      placeholder="Buscar plugin (GitHub, Stripe...)"
                      className="w-full bg-[#080c14] border border-cyan-950/80 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 pl-8 transition-all"
                    />
                    <span className="absolute left-2.5 top-2 text-xs text-gray-500">🔍</span>
                  </div>
                </div>

                {/* Filtros de Categorías horizontales estilo ChatGPT */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setPluginCategoryFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 ${
                      pluginCategoryFilter === 'all'
                        ? 'bg-cyan-500 text-black font-semibold'
                        : 'bg-[#080c14] text-gray-400 border border-cyan-950 hover:text-white'
                    }`}
                  >
                    Todos ({ALL_CHATGPT_WORK_PLUGINS.length})
                  </button>
                  {PLUGIN_CATEGORIES.map(cat => {
                    const count = ALL_CHATGPT_WORK_PLUGINS.filter(p => p.category === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setPluginCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
                          pluginCategoryFilter === cat.id
                            ? 'bg-cyan-500 text-black font-semibold'
                            : 'bg-[#080c14] text-gray-400 border border-cyan-950 hover:text-white'
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                        <span className="text-[9px] px-1 rounded bg-black/40 text-gray-300 font-mono">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Acciones Rápidas: Seleccionar todos / Deseleccionar */}
                <div className="flex items-center justify-between pt-1 border-t border-cyan-950/50 text-[11px]">
                  <span className="text-gray-400">
                    Mostrando <strong>{filteredPlugins.length}</strong> plugins disponibles
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFilteredPlugins}
                      className="text-cyan-400 hover:underline"
                    >
                      Habilitar visibles
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllPlugins}
                      className="text-red-400 hover:underline"
                    >
                      Desactivar todos
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid de Plugins */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {filteredPlugins.length === 0 ? (
                  <div className="col-span-2 py-12 text-center text-xs text-gray-500 border border-dashed border-cyan-950 rounded-xl">
                    No se encontraron plugins con el criterio de búsqueda.
                  </div>
                ) : (
                  filteredPlugins.map(plugin => {
                    const isEnabled = enabledPluginIds.includes(plugin.id);
                    return (
                      <div
                        key={plugin.id}
                        onClick={() => handlePluginToggle(plugin.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                          isEnabled
                            ? 'bg-cyan-950/30 border-cyan-500/50 shadow-sm'
                            : 'bg-[#05070b] border-cyan-950 hover:border-cyan-900/80 opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {}}
                          className="mt-1 rounded accent-cyan-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-lg">{plugin.icon}</span>
                              <h5 className="font-semibold text-white text-xs truncate">{plugin.name}</h5>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/40 text-cyan-300 font-mono uppercase shrink-0">
                              {plugin.category.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                            {plugin.description}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-3 border-t border-cyan-950/60">
            <span className="text-[11px] text-gray-500 font-mono">
              {enabledPluginIds.length} plugins activos en este agente
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20"
              >
                {agentToEdit ? 'Guardar Cambios' : 'Crear y Activar Agente'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
