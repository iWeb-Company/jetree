'use client';

import React, { useState, useEffect } from 'react';
import DepartmentTree from '@/components/DepartmentTree';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'agents' | 'activity'>('overview');
  
  // Estados de Autenticación con Supabase
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

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

  // Cargar tareas cuando la sesión está activa
  useEffect(() => {
    if (!session) return;

    async function fetchTasks() {
      try {
        const { data } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });
        setTasks(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchTasks();
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

  // Obtener datos del perfil según el email logueado
  const getProfileData = () => {
    const userEmail = session?.user?.email?.toLowerCase() || '';
    
    // Si el email pertenece a Facu
    if (userEmail.includes('facu') || userEmail.includes('backend')) {
      return {
        name: 'Demarco Facundo',
        role: 'Co-fundador & Backend Developer',
        initials: 'FD'
      };
    }

    // Si el email pertenece a Tomás
    if (userEmail.includes('tomas') || userEmail.includes('tommy') || userEmail.includes('frontend')) {
      return {
        name: 'Barajas Tomás',
        role: 'Frontend Developer',
        initials: 'TB'
      };
    }
    
    // Por defecto perfil de Valen
    return {
      name: 'Demarco Valentin',
      role: 'Co-fundador & UX/UI Designer',
      initials: 'VD'
    };
  };

  const userProfile = getProfileData();

  // ----------------------------------------------------------------
  // SI NO HAY SESIÓN: MOSTRAR PANTALLA DE LOGIN CORPORATIVA
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
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Correo Electrónico</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@iweb.com"
                required
                className="w-full bg-[#05070b] border border-cyan-950/80 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
  return (
    <div className="min-h-screen bg-[#05070b] text-gray-100 flex font-sans selection:bg-cyan-500 selection:text-black">
      
      {/* SIDEBAR CORPORATIVO */}
      <aside className="w-72 bg-[#080c14] border-r border-cyan-950/40 flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo Brand */}
          <div className="h-20 flex items-center px-6 border-b border-cyan-950/40 gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center overflow-hidden shadow-lg shadow-cyan-500/10">
              <img src="/favicon.png" alt="Jetree Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-lg">Jetree</span>
              <span className="text-[10px] block uppercase tracking-widest text-cyan-400 font-medium">Node System</span>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="p-4 space-y-1.5">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
              Panel General
            </button>
            <button 
              onClick={() => setActiveTab('departments')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'departments' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              Estructura de Nodos
            </button>
            <button 
              onClick={() => setActiveTab('agents')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'agents' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              Agentes IA
            </button>
            <button 
              onClick={() => setActiveTab('activity')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'activity' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              Webhook Telegram
            </button>
          </nav>
        </div>

        {/* Status Inferior Workspace y Botón Cerrar Sesión */}
        <div className="p-4 border-t border-cyan-950/40 space-y-3">
          <div className="bg-cyan-950/20 p-3 rounded-lg border border-cyan-900/40 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
            <div className="text-xs truncate">
              <p className="font-medium text-gray-200 truncate">{session.user.email}</p>
              <p className="text-gray-500 text-[10px]">Autenticado en Supabase</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs py-2 rounded-lg font-medium transition-all"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar con el perfil dinámico según quién inicie sesión */}
        <header className="h-20 bg-[#080c14]/80 backdrop-blur border-b border-cyan-950/40 px-8 flex items-center justify-between sticky top-0 z-20">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Centro de Operaciones</h2>
            <p className="text-xs text-gray-500 mt-0.5">iWeb Enterprise Workspace</p>
          </div>

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
        </header>

        {/* Dashboard Viewport */}
        <main className="p-8 space-y-8 max-w-7xl mx-auto w-full">
          
          {/* Métricas Corporativas Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                  <h3 className="text-2xl font-bold text-white mt-1">2</h3>
                </div>
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4">Estructura ramificada</p>
            </div>

            <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Agentes Activos</p>
                  <h3 className="text-2xl font-bold text-white mt-1">2</h3>
                </div>
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
              </div>
              <p className="text-xs text-cyan-400 mt-4 font-medium">Gemini Pro & OpenAI</p>
            </div>
          </div>

          {/* Sección de Tareas */}
          <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-cyan-950/40 flex justify-between items-center bg-[#080c14]/40">
              <div>
                <h3 className="text-base font-semibold text-white">Tareas Registradas</h3>
                <p className="text-xs text-gray-400 mt-0.5">Sincronización directa desde canal de Telegram</p>
              </div>
              <span className="text-xs bg-cyan-950/40 text-cyan-300 px-3 py-1 rounded-md border border-cyan-900/40 font-mono">
                {tasks.length} ítems
              </span>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-8 text-center text-gray-500 text-sm">Cargando registros...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-cyan-950/60 rounded-xl bg-cyan-950/5">
                  <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-xl mb-3">
                    💬
                  </div>
                  <h4 className="font-semibold text-gray-200">Sin tareas en el árbol</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">Envía una instrucción al Bot de Telegram para poblar este nodo de manera automática.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="bg-[#05070b] border border-cyan-950/50 p-4 rounded-xl flex items-center justify-between hover:border-cyan-800/60 transition-all">
                      <div className="space-y-1">
                        <h4 className="font-medium text-gray-100 text-sm">{task.title}</h4>
                        <p className="text-xs text-gray-400">{task.description || 'Sin descripción adicional'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium uppercase tracking-wider">
                          {task.status || 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Componente del Árbol de Departamentos */}
          <DepartmentTree />

        </main>
      </div>

    </div>
  );
}