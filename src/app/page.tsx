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
import ToolConnectionsModal from '@/components/ToolConnectionsModal';
import TelegramBotModal from '@/components/TelegramBotModal';
import DepartmentMembersModal from '@/components/DepartmentMembersModal';
import ArchivedItemsModal from '@/components/ArchivedItemsModal';
import { supabase } from '@/lib/supabase';
import { Agent, Department, Task, AgentActivityLog, UserSubscription } from '@/types';

function mapAgentRow(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    departmentId: row.department_id,
    roleType: row.role_type,
    subordinateIds: row.subordinate_ids || [],
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt || '',
    enabledPluginIds: row.enabled_tool_ids || [],
    status: row.status || 'idle',
    avatar: row.avatar || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    telegramBot: row.telegram_bot ? {
      botUsername: row.telegram_bot.bot_username || undefined,
      isActive: Boolean(row.telegram_bot.is_active),
      webhookUrl: `/api/webhook/telegram/${row.id}`,
      updatedAt: row.telegram_bot.updated_at,
    } : undefined,
  };
}

function mapTaskRow(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    departmentId: row.department_id || undefined,
    assignedAgentId: row.assigned_agent_id || undefined,
    status: row.status || 'pending',
    sourceChannel: row.source_channel || 'web',
    result: row.result || undefined,
    createdAt: row.created_at,
    retryCount: row.retry_count || 0,
    lastError: row.last_error || undefined,
    traceId: row.trace_id || undefined,
  };
}

export default function Home() {
  // Navegación de pestañas
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'agents' | 'activity'>('overview');

  // Filtro por departamento (para Dashboard General, Estructura de Nodos y Agentes IA)
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all');

  // Estados de datos
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<AgentActivityLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

  // Conexiones de proveedor API propias del usuario (solo estado, nunca claves).
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([
    {
      id: 'sub-gemini',
      provider: 'gemini',
      name: 'Gemini API',
      connected: false,
    },
    {
      id: 'sub-openai',
      provider: 'openai',
      name: 'OpenAI API',
      connected: false,
    },
    {
      id: 'sub-claude',
      provider: 'claude',
      name: 'Anthropic API',
      connected: false,
      tier: 'API propia',
    },
    {
      id: 'sub-custom',
      provider: 'custom',
      name: 'OpenRouter',
      connected: false,
    },
  ]);

  // Estados de Modales y Chat
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [isToolConnectionsOpen, setIsToolConnectionsOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [agentForTelegram, setAgentForTelegram] = useState<Agent | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const [departmentForMembers, setDepartmentForMembers] = useState<Department | null>(null);
  const [isArchivedItemsOpen, setIsArchivedItemsOpen] = useState(false);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Estados de Autenticación con Supabase
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('tool_connection');
    if (!status) return;
    setIsToolConnectionsOpen(true);
    if (status === 'error') window.alert(`No se pudo conectar la herramienta (${params.get('code') || 'error'}).`);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'facundod@iwebtecnology.com,valentind@iwebtecnology.com,tomasb@iwebtecnology.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const isAdmin = Boolean(session?.user?.email && adminEmails.includes(session.user.email.toLowerCase()));

  // Cargar el workspace del usuario desde Supabase; no se conserva estado de negocio en el navegador.
  useEffect(() => {
    let active = true;
    const loadWorkspace = async () => {
      if (!session?.user?.id) {
        setDepartments([]);
        setAgents([]);
        setTasks([]);
        setLogs([]);
        setSubscriptions(current => current.map(item => ({ ...item, connected: false, connectedAt: undefined })));
        setLoading(false);
        return;
      }

      setLoading(true);
      setWorkspaceError('');
      setDepartments([]);
      setAgents([]);
      setTasks([]);
      setLogs([]);
      setSelectedDepartmentFilter('all');
      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData.session?.access_token;
        if (!token) throw new Error('AUTH_REQUIRED');
        const headers = { Authorization: `Bearer ${token}` };
        const [agentsResponse, departmentsResponse, connectionsResponse, tasksResponse, logsResponse] = await Promise.all([
          fetch('/api/agents', { headers, cache: 'no-store' }),
          fetch('/api/departments', { headers, cache: 'no-store' }),
          fetch('/api/provider-connections', { headers, cache: 'no-store' }),
          fetch('/api/tasks', { headers, cache: 'no-store' }),
          fetch('/api/activity-logs', { headers, cache: 'no-store' }),
        ]);
        if (!active) return;
        if ([agentsResponse, departmentsResponse, connectionsResponse, tasksResponse, logsResponse].some(response => !response.ok)) {
          setWorkspaceError('Algunos datos no se pudieron cargar. Actualizá la página; si el problema persiste, revisá las migraciones de Supabase.');
        }

        if (agentsResponse.ok) {
          const payload = await agentsResponse.json();
          setAgents((payload.agents || []).map(mapAgentRow));
        }
        if (departmentsResponse.ok) {
          const payload = await departmentsResponse.json();
          setDepartments(payload.departments || []);
        }
        if (connectionsResponse.ok) {
          const payload = await connectionsResponse.json();
          const connections = Array.isArray(payload.connections) ? payload.connections : [];
          setSubscriptions(current => current.map(item => {
            const connection = connections.find((entry: any) => entry.provider === item.provider);
            return {
              ...item,
              connected: connection?.status === 'connected',
              connectedAt: connection?.connected_at,
              tier: connection?.status === 'connected' ? 'API propia' : undefined,
            };
          }));
        }
        if (tasksResponse.ok) {
          const payload = await tasksResponse.json();
          setTasks((payload.tasks || []).map(mapTaskRow));
        }
        if (logsResponse.ok) {
          const payload = await logsResponse.json();
          setLogs(payload.logs || []);
        }
      } catch (error) {
        if (active) {
          setWorkspaceError('No se pudo cargar el workspace. Actualizá la página o volvé a iniciar sesión.');
          console.warn('No se pudo cargar el workspace del usuario', error);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadWorkspace();
    return () => { active = false; };
  }, [session?.user?.id]);

  const saveAgentsState = (updated: Agent[]) => setAgents(updated);

  const reloadAgentDepartmentData = async () => {
    const { data } = await supabase.auth.getSession();
    const headers = { Authorization: `Bearer ${data.session?.access_token || ''}` };
    const [agentsResponse, departmentsResponse, tasksResponse] = await Promise.all([
      fetch('/api/agents', { headers, cache: 'no-store' }),
      fetch('/api/departments', { headers, cache: 'no-store' }),
      fetch('/api/tasks', { headers, cache: 'no-store' }),
    ]);
    if (agentsResponse.ok) {
      const payload = await agentsResponse.json();
      setAgents((payload.agents || []).map(mapAgentRow));
    }
    if (departmentsResponse.ok) {
      const payload = await departmentsResponse.json();
      setDepartments(payload.departments || []);
    }
    if (tasksResponse.ok) {
      const payload = await tasksResponse.json();
      setTasks((payload.tasks || []).map(mapTaskRow));
    }
  };

  const handleProviderConnectionChange = (provider: UserSubscription['provider'], connected: boolean, connectedAt?: string) => {
    setSubscriptions(current => current.map(item => item.provider === provider
      ? { ...item, connected, connectedAt, tier: connected ? 'API propia' : undefined }
      : item));
    const name = subscriptions.find(item => item.provider === provider)?.name || provider;
    addNewLog({
      id: `log-provider-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: connected ? 'completed' : 'manager_analysis',
      message: `Conexión API de ${name} ${connected ? 'guardada' : 'revocada'} para el usuario actual.`,
    });
  };

  // Guardar configuración del bot de Telegram para un agente específico
  const handleSaveTelegramBot = (agentId: string, botUsername: string) => {
    const updated = agents.map(a => {
      if (a.id === agentId) {
        return {
          ...a,
          telegramBot: botUsername ? {
            botUsername, isActive: true, webhookUrl: `/api/webhook/telegram/${agentId}`,
          } : undefined,
        };
      }
      return a;
    });

    setAgents(updated);

    const targetAg = agents.find(a => a.id === agentId);
    addNewLog({
      id: `log-tg-config-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId,
      agentName: targetAg?.name,
      type: 'telegram_in',
      message: botUsername ? `Bot de Telegram @${botUsername} vinculado al agente ${targetAg?.name}.` : `Bot de Telegram desconectado del agente ${targetAg?.name}.`,
      details: botUsername ? `Webhook activo en /api/webhook/telegram/${agentId}` : 'Se revocó el webhook y se eliminó el token cifrado.',
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

  // Escuchar tareas entrantes del webhook; la carga inicial usa el endpoint autenticado.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const channel = supabase
      .channel('tasks-realtime-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        (payload: any) => {
          const newTask = payload.new;
          const formattedTask = mapTaskRow(newTask);
          setTasks(prev => prev.some(task => task.id === formattedTask.id) ? prev : [formattedTask, ...prev]);

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
  }, [session?.user?.id]);

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
  const addNewLog = async (newLog: AgentActivityLog) => {
    setLogs(prev => [newLog, ...prev]);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch('/api/activity-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newLog),
      });
      if (!response.ok) throw new Error('No se pudo guardar el evento de actividad.');
      const payload = await response.json();
      if (payload.log) setLogs(current => current.map(log => log.id === newLog.id ? payload.log : log));
    } catch (error) {
      console.warn('No se pudo persistir el evento de actividad', error);
    }
  };

  const handleSaveAgent = async (savedAgent: Agent) => {
    const exists = agents.some(a => a.id === savedAgent.id);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Tu sesión expiró. Iniciá sesión nuevamente.');
    const response = await fetch('/api/agents', {
      method: exists ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...(exists ? { id: savedAgent.id } : {}),
        department_id: savedAgent.departmentId,
        name: savedAgent.name,
        description: savedAgent.description,
        role_type: savedAgent.roleType,
        provider: savedAgent.provider,
        model: savedAgent.model,
        system_prompt: savedAgent.systemPrompt,
        subordinate_ids: savedAgent.subordinateIds || [],
        enabled_tool_ids: savedAgent.enabledPluginIds || [],
        avatar: savedAgent.avatar,
        status: savedAgent.status,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.agent) throw new Error(payload.error || 'No se pudo guardar el agente.');
    const saved = mapAgentRow(payload.agent);
    saveAgentsState(exists
      ? agents.map(agent => agent.id === saved.id ? saved : agent)
      : [...agents, saved]);

    addNewLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId: saved.id,
      agentName: saved.name,
      type: 'manager_analysis',
      message: exists
        ? `Configuración del agente ${saved.name} actualizada.`
        : `Nuevo agente ${saved.name} (${saved.roleType === 'manager' ? 'Manager / Orquestador' : 'Independiente'}) guardado en el departamento.`,
    });
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (!window.confirm(`¿Archivar el agente ${agent.name}? Sus conversaciones se conservarán y podrás restaurarlo desde la papelera.`)) return;
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/agents?id=${encodeURIComponent(agent.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error || 'No se pudo eliminar el agente.');
      return;
    }
    setAgents(current => current.filter(item => item.id !== agent.id));
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

  const handleEditDepartment = async (department: Department) => {
    const name = window.prompt('Nombre del departamento', department.name);
    if (!name?.trim()) return;
    const description = window.prompt('Descripción del departamento', department.description) ?? department.description;
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/departments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
      body: JSON.stringify({ id: department.id, name, description }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.department) {
      window.alert(payload.error || 'No se pudo actualizar el departamento.');
      return;
    }
    setDepartments(current => current.map(item => item.id === department.id ? payload.department : item));
  };

  const handleDeleteDepartment = async (department: Department) => {
    if (!window.confirm(`¿Archivar el departamento ${department.name}? Sus agentes, tareas y conversaciones se conservarán y podrás restaurarlo desde la papelera.`)) return;
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/departments?id=${encodeURIComponent(department.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error || 'No se pudo eliminar el departamento.');
      return;
    }
    setDepartments(current => current.filter(item => item.id !== department.id));
    setAgents(current => current.filter(agent => agent.departmentId !== department.id));
    setTasks(current => current.filter(task => task.departmentId !== department.id));
    if (selectedDepartmentFilter === department.id) setSelectedDepartmentFilter('all');
  };

  // Actualizar estado de una tarea
  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.task) throw new Error(payload.error || 'No se pudo actualizar la tarea.');
      setTasks(prev => prev.map(task => task.id === taskId ? mapTaskRow(payload.task) : task));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo persistir el estado de la tarea.');
    }
  };

  const clearActivityLogs = async () => {
    if (!window.confirm('¿Borrar los registros de actividad de tu cuenta? Esta acción no se puede deshacer.')) return;
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/activity-logs', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
    });
    if (response.ok) {
      const refreshed = await fetch('/api/activity-logs', {
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
        cache: 'no-store',
      });
      if (refreshed.ok) {
        const payload = await refreshed.json();
        setLogs(payload.logs || []);
      }
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

  if (loading) {
    return <div className="min-h-screen bg-[#05070b] text-cyan-300 flex items-center justify-center text-sm">Cargando tu workspace…</div>;
  }

  // ----------------------------------------------------------------
  // SI HAY SESIÓN: MOSTRAR EL PANEL PRINCIPAL CORPORATIVO
  // ----------------------------------------------------------------
  const managersCount = agents.filter(a => a.roleType === 'manager').length;
  const independentCount = agents.filter(a => a.roleType === 'independent').length;
  const connectedProvidersCount = subscriptions.filter(s => s.connected).length;
  const telegramBotsCount = agents.filter(a => a.telegramBot?.isActive).length;

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
        <header className="min-h-20 bg-[#080c14]/80 backdrop-blur border-b border-cyan-950/40 px-4 py-4 md:px-8 flex flex-wrap gap-3 items-center justify-between sticky top-0 z-20">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Centro de Operaciones</h2>
            <p className="text-xs text-gray-500 mt-0.5">iWeb Enterprise Workspace • Orquestación Multi-Agente & Telegram</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              onClick={() => setIsToolConnectionsOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-cyan-800/40 bg-cyan-950/25 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-900/40"
              title="Administrar conectores GitHub y Google Drive"
            >
              <span aria-hidden="true">🔌</span><span>Herramientas</span>
            </button>

            {/* Botón Gestión de conexiones API */}
            <button
              onClick={() => setIsOAuthModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/40 text-xs font-semibold transition-all shadow-sm"
              title="Administrar conexiones API propias"
            >
              <span>🔐</span>
              <span className="hidden sm:inline">Conexiones IA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-200 font-mono">
                {connectedProvidersCount}/4
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

        <nav aria-label="Navegación móvil" className="md:hidden flex flex-wrap gap-2 border-b border-cyan-950/40 p-3">
          {([
            ['overview', 'Panel General'], ['departments', 'Estructura de Nodos'],
            ['agents', 'Agentes IA'], ['activity', 'Monitoreo en Vivo'],
          ] as const).map(([tab, label]) => (
            <button key={tab} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)} className={`rounded-lg px-3 py-2 text-xs ${activeTab === tab ? 'bg-cyan-500/20 text-cyan-200' : 'bg-gray-900 text-gray-300'}`}>{label}</button>
          ))}
          <button onClick={handleLogout} className="rounded-lg px-3 py-2 text-xs text-red-300">Cerrar Sesión</button>
        </nav>

        {/* Viewport Principal */}
        <main className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full flex-1">
          {workspaceError && (
            <div role="alert" className="rounded-xl border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-200">
              {workspaceError}
            </div>
          )}

          {/* Métricas Corporativas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">

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
                <div className="flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">Topología del Árbol Organizacional</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Visualiza departamentos, managers asignados y agentes bajo su mando o independientes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsArchivedItemsOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 text-xs transition-all"
                >
                  Papelera
                </button>
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
                currentUserId={session.user.id}
                isAdmin={isAdmin}
                onEditDepartment={handleEditDepartment}
                onDeleteDepartment={handleDeleteDepartment}
                onManageMembers={setDepartmentForMembers}
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
                    <span>Conexiones API ({connectedProvidersCount})</span>
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
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-5">
                  {filteredAgents.map(agent => {
                    const subordinates = agents.filter(a => agent.subordinateIds?.includes(a.id));
                    return (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        subordinates={subordinates}
                        onChat={openChatWithAgent}
                        onEdit={isAdmin || agent.createdBy === session.user.id ? ag => {
                          setAgentToEdit(ag);
                          setIsAgentModalOpen(true);
                        } : undefined}
                        onDelete={isAdmin || agent.createdBy === session.user.id ? handleDeleteAgent : undefined}
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
                onClearLogs={clearActivityLogs}
              />
            </div>
          )}

        </main>
      </div>

      {/* MODAL PARA CREAR / EDITAR AGENTES */}
      <AgentModal
        key={agentToEdit?.id || 'new-agent'}
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

      {/* MODAL DE CONEXIONES DE PROVEEDORES */}
      <OAuthSubscriptionsModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
        userEmail={session.user.email}
        subscriptions={subscriptions}
        onConnectionChange={handleProviderConnectionChange}
      />

      <ToolConnectionsModal isOpen={isToolConnectionsOpen} onClose={() => setIsToolConnectionsOpen(false)} />

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

      <DepartmentMembersModal
        department={departmentForMembers}
        onClose={() => setDepartmentForMembers(null)}
      />

      <ArchivedItemsModal
        isOpen={isArchivedItemsOpen}
        onClose={() => setIsArchivedItemsOpen(false)}
        onRestored={reloadAgentDepartmentData}
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
        onManageTools={() => setIsToolConnectionsOpen(true)}
      />

    </div>
  );
}
