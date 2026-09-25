'use client';

import React from 'react';

type TabType = 'overview' | 'departments' | 'agents' | 'activity';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  userEmail: string;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, userEmail, onLogout }: SidebarProps) {
  return (
    <aside className="w-72 bg-[#080c14] border-r border-cyan-950/40 flex flex-col justify-between hidden md:flex shrink-0">
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
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'overview' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
            </svg>
            Panel General
          </button>

          <button 
            onClick={() => setActiveTab('departments')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'departments' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
            Estructura de Nodos
          </button>

          <button 
            onClick={() => setActiveTab('agents')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'agents' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
            Agentes IA
          </button>

          <button 
            onClick={() => setActiveTab('activity')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'activity' 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
            }`}
          >
            <div className="relative">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            </div>
            Monitoreo en Vivo
          </button>
        </nav>
      </div>

      {/* Status Inferior Workspace y Botón Cerrar Sesión */}
      <div className="p-4 border-t border-cyan-950/40 space-y-3">
        <div className="bg-cyan-950/20 p-3 rounded-lg border border-cyan-900/40 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
          <div className="text-xs truncate">
            <p className="font-medium text-gray-200 truncate">{userEmail}</p>
            <p className="text-gray-500 text-[10px]">Supabase Auth Conectado</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs py-2 rounded-lg font-medium transition-all"
        >
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
