'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import DepartmentTree from '@/components/DepartmentTree';
import AgentCard from '@/components/AgentCard';
import AgentModal from '@/components/AgentModal';
import AgentChatDrawer from '@/components/AgentChatDrawer';
import LiveMonitorFeed from '@/components/LiveMonitorFeed';
import TaskBoard from '@/components/TaskBoard';
import OAuthSubscriptionsModal from '@/components/OAuthSubscriptionsModal';
import TelegramBotModal from '@/components/TelegramBotModal';
import { supabase } from '@/lib/supabase';
import { Agent, Department, Task, AgentActivityLog, UserSubscription } from '@/types';
import { INITIAL_DEPARTMENTS, INITIAL_AGENTS, INITIAL_LOGS } from '@/lib/agents/initialData';

export default function Home() {
  // Navegación de pestañas
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'agents' | 'activity'>('overview');

  // Filtro por departamento (para Dashboard General, Estructura de Nodos y Agentes IA)
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all');

  // Estados de datos
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [logs, setLogs] = useState<AgentActivityLog[]>(INITIAL_LOGS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de Suscripciones OAuth del Usuario
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([
    {
      id: 'sub-gemini',
      provider: 'gemini',
      name: 'Google Gemini Pro / Advanced',
      connected: false,
    },
    {
      id: 'sub-openai',
      provider: 'openai',
      name: 'OpenAI (ChatGPT Pro / Plus)',
      connected: false,
    },
    {
      id: 'sub-claude',
      provider: 'claude',
      name: 'Anthropic Claude Pro',
      connected: false,
      tier: 'Claude Pro',
    },
  ]);

  // Estados de Modales y Chat
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [agentForTelegram, setAgentForTelegram] = useState<Agent | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Estados de Autenticación con Supabase
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'facundod@iwebtecnology.com,valentind@iwebtecnology.com,tomasb@iwebtecnology.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const isAdmin = Boolean(session?.user?.email && adminEmails.includes(session.user.email.toLowerCase()));

  // Cargar agentes persistidos localmente si existen
  useEffect(() => {
    try {
      // Remove legacy pre-multi-user storage so test agents and shared credentials cannot leak.
      localStorage.removeItem('jetree_agents');
      localStorage.removeItem('jetree_user_subscriptions');
      const userKey = session?.user?.id || session?.user?.email || 'anonymous';
      const savedAgents = localStorage.getItem(`jetree_agents:${userKey}`);
      if (savedAgents) {
        setAgents(JSON.parse(savedAgents));
      }
      const savedSubs = localStorage.getItem(`jetree_user_subscriptions:${userKey}`);
      if (savedSubs) {
        setSubscriptions(JSON.parse(savedSubs));
      }

      if (session) {
        supabase.auth.getSession().then(async ({ data: { session: authSession } }) => {
          const headers: Record<string, string> = authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {};
          const [agentsResponse, departmentsResponse] = await Promise.all([
            fetch('/api/agents', { headers }),
            fetch('/api/departments', { headers }),
          ]);
          if (agentsResponse.ok) {
            const payload = await agentsResponse.json();
            setAgents((payload.agents || []).map((agent: any) => ({
              ...agent,
              departmentId: agent.department_id,
              roleType: agent.role_type,
              systemPrompt: agent.system_prompt,
              subordinateIds: agent.subordinate_ids,
              enabledPluginIds: agent.enabled_tool_ids,
              createdAt: agent.created_at,
            })));
          }
          if (departmentsResponse.ok) {
            const payload = await departmentsResponse.json();
            if (payload.departments?.length) setDepartments(payload.departments);
          }
        }).catch(error => console.warn('No se pudieron cargar los datos del workspace', error));
      }
    } catch (e) {
      console.warn('No se pudieron leer los agentes locales', e);
    }
  }, [session?.user?.id, session?.user?.email]);

  // Guardar agentes en localStorage cuando cambien
  const saveAgentsState = (updated: Agent[]) => {
    setAgents(updated);
    try {
      const userKey = session?.user?.id || session?.user?.email || 'anonymous';
      localStorage.setItem(`jetree_agents:${userKey}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando agentes', e);
    }
  };

  // Alternar suscripción OAuth
  const handleToggleSubscription = (provider: 'openai' | 'gemini' | 'claude') => {
    const updated = subscriptions.map(s => {
      if (s.provider === provider) {
        const nextState = !s.connected;
        return {
          ...s,
          connected: nextState,
          connectedAt: nextState ? new Date().toISOString() : undefined,
          userAccountEmail: nextState ? (session?.user?.email || 'usuario@iweb.com') : undefined,
        };
      }
      return s;
    });

    setSubscriptions(updated);
    try {
      const userKey = session?.user?.id || session?.user?.email || 'anonymous';
      localStorage.setItem(`jetree_user_subscriptions:${userKey}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando suscripciones', e);
    }

    const provName = provider === 'openai' ? 'ChatGPT Pro' : provider === 'gemini' ? 'Gemini Pro' : 'Claude Pro';
    addNewLog({
      id: `log-oauth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'manager_analysis',
      message: `Suscripción OAuth de ${provName} ${updated.find(s => s.provider === provider)?.connected ? 'vinculada con éxito' : 'desconectada'}.`,
    });
  };

  // Guardar configuración del bot de Telegram para un agente específico
  const handleSaveTelegramBot = (agentId: string, botToken: string, botUsername: string) => {
    const updated = agents.map(a => {
      if (a.id === agentId) {
        return {
          ...a,
          telegramBot: {
            botToken,
            botUsername,
            isActive: true,
            webhookUrl: `/api/webhook/telegram/${agentId}`,
          },
        };
      }
      return a;
    });

    saveAgentsState(updated);

    const targetAg = agents.find(a => a.id === agentId);
    addNewLog({
      id: `log-tg-config-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId,
      agentName: targetAg?.name,
      type: 'telegram_in',
      message: `Bot de Telegram @${botUsername || 'AgenteBot'} vinculado exitosamente al agente ${targetAg?.name}.`,
      details: `Token de BotFather activado. Escuchando en webhook /api/webhook/telegram/${agentId}`,
    });
  };

  // Verificar sesión activa al cargar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cargar tareas de Supabase y configurar escucha en tiempo real (Realtime)
  useEffect(() => {
    if (!session) return;

    async function fetchTasks() {
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const formattedTasks: Task[] = data.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            departmentId: t.department_id,
            assignedAgentId: t.assigned_agent_id,
            status: t.status || 'pending',
            sourceChannel: t.source_channel || (t.description?.includes('Telegram') ? 'telegram' : 'web'),
            createdAt: t.created_at,
          }));
          setTasks(formattedTasks);
        }
      } catch (err) {
        console.error('Error cargando tareas:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTasks();

    // Suscripción Realtime a nuevas tareas (ej: entrantes desde Telegram Webhook)
    const channel = supabase
      .channel('tasks-realtime-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        (payload: any) => {
          const newTask = payload.new;
          const formattedTask: Task = {
            id: newTask.id,
            title: newTask.title,
            description: newTask.description,
            departmentId: newTask.department_id,
            status: newTask.status || 'pending',
            sourceChannel: newTask.source_channel || 'telegram',
            createdAt: newTask.created_at || new Date().toISOString(),
          };

          setTasks(prev => [formattedTask, ...prev]);

          addNewLog({
            id: `log-tg-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'telegram_in',
            message: `Nueva tarea recibida desde Telegram: "${formattedTask.title}"`,
            details: formattedTask.description,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  // Manejar Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
    }
    setAuthLoading(false);
  };

  // Manejar Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Agregar nuevo log al monitoreo
  const addNewLog = (newLog: AgentActivityLog) => {
    setLogs(prev => [newLog, ...prev]);
  };

  // Guardar nuevo agente o editar existente
  const handleSaveAgent = (savedAgent: Agent) => {
    const exists = agents.some(a => a.id === savedAgent.id);
    let updated: Agent[];
    if (exists) {
      updated = agents.map(a => (a.id === savedAgent.id ? savedAgent : a));
    } else {
      updated = [...agents, savedAgent];
    }
    saveAgentsState(updated);

    supabase.auth.getSession().then(async ({ data: { session: authSession } }) => {
      if (!authSession?.access_token) return;
      const dbAgent = {
        ...(exists ? { id: savedAgent.id } : {}),
        department_id: savedAgent.departmentId,
        name: savedAgent.name,
        description: savedAgent.description,
        role_type: savedAgent.roleType,
        provider: savedAgent.provider === 'custom' ? 'openai' : savedAgent.provider,
        model: savedAgent.model,
        system_prompt: savedAgent.systemPrompt,
        subordinate_ids: savedAgent.subordinateIds || [],
        enabled_tool_ids: savedAgent.enabledPluginIds || [],
        avatar: savedAgent.avatar,
        status: savedAgent.status,
      };
      const response = await fetch('/api/agents', {
        method: exists ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify(dbAgent),
      });
      if (!response.ok) {
        console.warn('No se pudo persistir el agente en Supabase', await response.text());
      } else if (!exists) {
        const saved = await response.json();
        if (saved.agent?.id) {
          const withServerId = updated.map(agent => agent.id === savedAgent.id ? { ...agent, id: saved.agent.id } : agent);
          saveAgentsState(withServerId);
        }
      }
    });

    addNewLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId: savedAgent.id,
      agentName: savedAgent.name,
      type: 'manager_analysis',
      message: exists
        ? `Configuración del agente ${savedAgent.name} actualizada.`
        : `Nuevo agente ${savedAgent.name} (${savedAgent.roleType === 'manager' ? 'Manager / Orquestador' : 'Independiente'}) desplegado en el nodo.`,
    });
  };

  const handleCreateDepartment = async () => {
    const name = window.prompt('Nombre del nuevo departamento');
    if (!name?.trim()) return;
    const description = window.prompt('Descripción del departamento (opcional)') || '';
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, description, icon: '🌳' }),
    });
    if (!response.ok) {
      console.error('No se pudo crear el departamento', await response.text());
      return;
    }
    const payload = await response.json();
    if (payload.department) setDepartments(previous => [...previous, payload.department]);
  };

  // Actualizar estado de una tarea
  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    } catch (e) {
      console.warn('No se pudo persistir el estado de la tarea en BD', e);
    }
  };

  // Abrir chat con un agente
  const openChatWithAgent = (agent: Agent) => {
    setChatAgent(agent);
    setIsChatOpen(true);
  };

  // Abrir modal de Bot de Telegram para un agente
  const openTelegramModalForAgent = (agent: Agent) => {
    setAgentForTelegram(agent);
    setIsTelegramModalOpen(true);
  };

  // Obtener datos del perfil según el email logueado
  const getProfileData = () => {
    const userEmail = session?.user?.email?.toLowerCase() || '';
    if (userEmail.includes('facu') || userEmail.includes('backend')) {
      return {
        name: 'Demarco Facundo',
        role: 'Co-fundador & Backend Developer',
        initials: 'FD',
      };
    }
    if (userEmail.includes('tomas') || userEmail.includes('tommy') || userEmail.includes('frontend')) {
      return {
        name: 'Barajas Tomás',
        role: 'Frontend Developer',
        initials: 'TB',
      };
    }
    return {
      name: 'Demarco Valentin',
      role: 'Co-fundador & UX/UI Designer',
      initials: 'VD',
    };
  };

  const userProfile = getProfileData();

  // Filtrar agentes según el departamento seleccionado
  const filteredAgents = selectedDepartmentFilter === 'all'
    ? agents
    : agents.filter(a => a.departmentId === selectedDepartmentFilter);

  // ----------------------------------------------------------------
  // SI NO HAY SESIÓN: MOSTRAR PANTALLA DE LOGIN CORPORATIVA (IDÉNTICA)
  // ----------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-[#05070b] text-gray-100 flex items-center justify-center p-4 font-sans selection:bg-cyan-500 selection:text-black">
        <div className="max-w-md w-full bg-[#080c14] border border-cyan-950/60 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/10 overflow-hidden p-2">
              <img src="/favicon.png" alt="Jetree Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Jetree Enterprise</h1>
            <p className="text-xs text-gray-400">Inicia sesión en tu Node System de iWeb</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@iweb.com"
                required
                className="w-full bg-[#05070b] border border-cyan-950/80 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#05070b] border border-cyan-950/80 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl transition-all shadow-lg shadow-cyan-500/20 text-sm mt-2 disabled:opacity-50"
            >
              {authLoading ? 'Verificando credenciales...' : 'Acceder al Workspace'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-cyan-950/40">
            <p className="text-[11px] text-gray-500">Sistema seguro conectado a Supabase Auth</p>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // SI HAY SESIÓN: MOSTRAR EL PANEL PRINCIPAL CORPORATIVO
  // ----------------------------------------------------------------
  const managersCount = agents.filter(a => a.roleType === 'manager').length;
  const independentCount = agents.filter(a => a.roleType === 'independent').length;
  const connectedOAuthCount = subscriptions.filter(s => s.connected).length;
  const telegramBotsCount = agents.filter(a => a.telegramBot?.botToken).length;

  return (
    <div className="min-h-screen bg-[#05070b] text-gray-100 flex font-sans selection:bg-cyan-500 selection:text-black">

      {/* SIDEBAR CORPORATIVO MODULARIZADO */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userEmail={session.user.email}
        onLogout={handleLogout}
      />

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top Navbar */}
        <header className="h-20 bg-[#080c14]/80 backdrop-blur border-b border-cyan-950/40 px-8 flex items-center justify-between sticky top-0 z-20">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Centro de Operaciones</h2>
            <p className="text-xs text-gray-500 mt-0.5">iWeb Enterprise Workspace • Orquestación Multi-Agente & Telegram</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Botón Gestión de Suscripciones OAuth */}
            <button
              onClick={() => setIsOAuthModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/40 text-xs font-semibold transition-all shadow-sm"
              title="Vincular suscripciones de ChatGPT Pro, Gemini Pro y Claude Pro"
            >
              <span>🔐</span>
              <span className="hidden sm:inline">Suscripciones IA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-200 font-mono">
                {connectedOAuthCount}/3
              </span>
            </button>

            {/* Botón Acción Rápida: Hablar con el Manager Principal */}
            {agents.find(a => a.roleType === 'manager') && (
              <button
                onClick={() => {
                  const firstManager = agents.find(a => a.roleType === 'manager');
                  if (firstManager) openChatWithAgent(firstManager);
                }}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition-all shadow-sm"
              >
                <span>🧠</span>
                <span>Hablar con Manager</span>
              </button>
            )}

            {/* Perfil Dinámico */}
            <div className="flex items-center gap-3 bg-[#0b101d] px-3.5 py-2 rounded-xl border border-cyan-950/60 shadow-inner">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center text-black font-bold text-xs shadow-md">
                {userProfile.initials}
              </div>
              <div className="text-left">
                <p className="font-semibold text-white text-xs leading-tight">{userProfile.name}</p>
                <p className="text-[10px] text-cyan-400 font-medium">{userProfile.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Viewport Principal */}
        <main className="p-8 space-y-8 max-w-7xl mx-auto w-full flex-1">

          {/* Métricas Corporativas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">

            <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tareas en Nodos</p>
                  <h3 className="text-2xl font-bold text-white mt-1">{tasks.length}</h3>
                </div>
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                </div>
              </div>
              <p className="text-xs text-cyan-400 mt-4 font-medium flex items-center gap-1">
                <span>⚡ Tiempo real conectado</span>
              </p>
            </div>

            <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Departamentos</p>
                  <h3 className="text-2xl font-bold text-white mt-1">{departments.length}</h3>
                </div>
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4">Estructura jerárquica</p>
            </div>

            <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Managers / Orquestadores</p>
                  <h3 className="text-2xl font-bold text-cyan-400 mt-1">{managersCount}</h3>
                </div>
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                  <span className="text-base">👑</span>
                </div>
              </div>
              <p className="text-xs text-cyan-400 mt-4 font-medium">Capacidad de Derivación</p>
            </div>

            <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Bots de Telegram</p>
                  <h3 className="text-2xl font-bold text-blue-400 mt-1">{telegramBotsCount}</h3>
                </div>
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                  <span className="text-base">✈️</span>
                </div>
              </div>
              <p className="text-xs text-blue-400 mt-4 font-medium flex items-center gap-1">
                <span>Vía @BotFather por Agente</span>
              </p>
            </div>

          </div>

          {/* -------------------------------------------------------- */}
          {/* PESTAÑA 1: PANEL GENERAL (OVERVIEW)                     */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Tablero Kanban de Tareas con Filtro por Departamento */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white">Flujo Operativo de Tareas</h3>
                    <p className="text-xs text-gray-400">Canal sincronizado con Telegram y tareas clasificadas por departamento</p>
                  </div>
                  <span className="text-xs bg-cyan-950/40 text-cyan-300 px-3 py-1 rounded-md border border-cyan-900/40 font-mono">
                    {tasks.length} tareas totales
                  </span>
                </div>

                <TaskBoard
                  tasks={tasks}
                  departments={departments}
                  selectedDepartmentId={selectedDepartmentFilter}
                  onSelectDepartment={setSelectedDepartmentFilter}
                  onUpdateStatus={handleUpdateTaskStatus}
                />
              </div>

              {/* Árbol Jerárquico Resumido */}
              <DepartmentTree
                departments={departments}
                agents={agents}
                selectedDepartmentId={selectedDepartmentFilter}
                onSelectDepartment={setSelectedDepartmentFilter}
                onSelectAgent={openChatWithAgent}
              />
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* PESTAÑA 2: ESTRUCTURA DE NODOS (DEPARTMENTS)             */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'departments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Topología del Árbol Organizacional</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Visualiza departamentos, managers asignados y agentes bajo su mando o independientes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateDepartment}
                  className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-cyan-300 border border-cyan-900 text-xs transition-all"
                >
                  <span>+ Nuevo departamento</span>
                </button>
                <button
                  onClick={() => {
                    setAgentToEdit(null);
                    setIsAgentModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Agregar Agente al Árbol</span>
                </button>
                </div>
              </div>

              <DepartmentTree
                departments={departments}
                agents={agents}
                selectedDepartmentId={selectedDepartmentFilter}
                onSelectDepartment={setSelectedDepartmentFilter}
                onSelectAgent={openChatWithAgent}
              />
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* PESTAÑA 3: AGENTES IA (AGENTS)                           */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Gestión de Agentes de Inteligencia Artificial</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Crea agentes independientes o managers, activa plugins de ChatGPT/Claude/Gemini y bots de Telegram
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={() => setIsOAuthModalOpen(true)}
                    className="px-3.5 py-2.5 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/40 text-xs font-semibold transition-all flex items-center gap-1.5"
                  >
                    <span>🔐</span>
                    <span>Suscripciones OAuth</span>
                  </button>

                  <button
                    onClick={() => {
                      setAgentToEdit(null);
                      setIsAgentModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
                  >
                    <span className="text-base font-bold">+</span>
                    <span>Crear Nuevo Agente</span>
                  </button>
                </div>
              </div>

              {/* Barra de Filtro de Departamento para Agentes IA */}
              <div className="p-3 bg-[#0b101d] border border-cyan-950/60 rounded-xl flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-gray-400 font-mono pl-1">Filtrar por Departamento:</span>
                <button
                  onClick={() => setSelectedDepartmentFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                    selectedDepartmentFilter === 'all'
                      ? 'bg-cyan-500 text-black font-semibold shadow-sm shadow-cyan-500/20'
                      : 'bg-[#05070b] text-gray-400 border border-cyan-950 hover:text-white'
                  }`}
                >
                  Todos ({agents.length})
                </button>
                {departments.map(dept => {
                  const count = agents.filter(a => a.departmentId === dept.id).length;
                  return (
                    <button
                      key={dept.id}
                      onClick={() => setSelectedDepartmentFilter(dept.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                        selectedDepartmentFilter === dept.id
                          ? 'bg-cyan-500 text-black font-semibold shadow-sm shadow-cyan-500/20'
                          : 'bg-[#05070b] text-gray-400 border border-cyan-950 hover:text-white'
                      }`}
                    >
                      <span>{dept.icon}</span>
                      <span>{dept.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-gray-300 font-mono">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grid de Agentes Filtrados */}
              {filteredAgents.length === 0 ? (
                <div className="py-12 border border-dashed border-cyan-950/60 rounded-xl text-center text-xs text-gray-500">
                  No se encontraron agentes en el departamento seleccionado.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAgents.map(agent => {
                    const subordinates = agents.filter(a => agent.subordinateIds?.includes(a.id));
                    return (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        subordinates={subordinates}
                        onChat={openChatWithAgent}
                        onEdit={ag => {
                          setAgentToEdit(ag);
                          setIsAgentModalOpen(true);
                        }}
                        onConfigureTelegram={ag => openTelegramModalForAgent(ag)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* PESTAÑA 4: MONITOREO EN VIVO & TELEGRAM (ACTIVITY)      */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Centro de Mando & Monitoreo en Tiempo Real</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Visualiza los mensajes entrantes de Telegram, pensamientos de los Managers, delegaciones y outputs de especialistas
                </p>
              </div>

              <LiveMonitorFeed
                logs={logs}
                onClearLogs={() => setLogs([])}
              />
            </div>
          )}

        </main>
      </div>

      {/* MODAL PARA CREAR / EDITAR AGENTES */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setAgentToEdit(null);
        }}
        onSave={handleSaveAgent}
        departments={departments}
        existingAgents={agents}
        userSubscriptions={subscriptions}
        agentToEdit={agentToEdit}
        onOpenSubscriptions={() => {
          setIsAgentModalOpen(false);
          setIsOAuthModalOpen(true);
        }}
      />

      {/* MODAL DE SUSCRIPCIONES OAUTH */}
      <OAuthSubscriptionsModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
        userEmail={session.user.email}
        subscriptions={subscriptions}
        onToggleSubscription={handleToggleSubscription}
      />

      {/* MODAL DE VINCULACIÓN CON BOTFATHER DE TELEGRAM */}
      <TelegramBotModal
        isOpen={isTelegramModalOpen}
        agent={agentForTelegram}
        onClose={() => {
          setIsTelegramModalOpen(false);
          setAgentForTelegram(null);
        }}
        onSaveBotConfig={handleSaveTelegramBot}
      />

      {/* DRAWER / CHAT CON CUALQUIER AGENTE O MANAGER */}
      <AgentChatDrawer
        isOpen={isChatOpen}
        agent={chatAgent}
        onClose={() => {
          setIsChatOpen(false);
          setChatAgent(null);
        }}
        availableAgents={agents}
        onNewLog={addNewLog}
      />

    </div>
  );
}
