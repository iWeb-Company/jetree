'use client';

import React from 'react';
import { Department, Agent } from '@/types';

interface DepartmentTreeProps {
  departments?: Department[];
  agents?: Agent[];
  selectedDepartmentId?: string;
  onSelectDepartment?: (deptId: string) => void;
  onSelectAgent?: (agent: Agent) => void;
}

export default function DepartmentTree({
  departments = [],
  agents = [],
  selectedDepartmentId = 'all',
  onSelectDepartment,
  onSelectAgent,
}: DepartmentTreeProps) {
  // Filtrar departamentos según la selección
  const filteredDepartments = selectedDepartmentId === 'all'
    ? departments
    : departments.filter(d => d.id === selectedDepartmentId);

  return (
    <div className="bg-[#0b101d] border border-cyan-950/60 rounded-xl shadow-lg overflow-hidden">
      
      {/* Header con Filtro por Departamento */}
      <div className="px-6 py-4 border-b border-cyan-950/40 bg-[#080c14]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">Estructura de Nodos & Departamentos</h3>
          <p className="text-xs text-gray-400 mt-0.5">Jerarquía visual de la organización y sus especialistas</p>
        </div>

        {/* Barra de Filtro de Departamento */}
        {onSelectDepartment && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] text-gray-400 font-mono mr-1">Filtrar:</span>
            <button
              onClick={() => onSelectDepartment('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                selectedDepartmentId === 'all'
                  ? 'bg-cyan-500 text-black font-semibold shadow-sm shadow-cyan-500/20'
                  : 'bg-[#05070b] text-gray-400 border border-cyan-950 hover:text-white'
              }`}
            >
              Todos ({departments.length})
            </button>
            {departments.map(dept => (
              <button
                key={dept.id}
                onClick={() => onSelectDepartment(dept.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedDepartmentId === dept.id
                    ? 'bg-cyan-500 text-black font-semibold shadow-sm shadow-cyan-500/20'
                    : 'bg-[#05070b] text-gray-400 border border-cyan-950 hover:text-white'
                }`}
              >
                <span>{dept.icon}</span>
                <span>{dept.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {filteredDepartments.map(dept => {
          // Filtrar agentes de este departamento
          const deptAgents = agents.filter(a => a.departmentId === dept.id);
          const managers = deptAgents.filter(a => a.roleType === 'manager');
          const independents = deptAgents.filter(a => a.roleType === 'independent');

          return (
            <div key={dept.id} className="border border-cyan-950/60 bg-[#05070b] p-5 rounded-xl space-y-4">
              {/* Encabezado del Departamento */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-lg font-bold">
                    {dept.icon || '🌳'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-base">{dept.name}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{dept.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-950/40 text-cyan-300 border border-cyan-900/50 font-mono">
                    {deptAgents.length} agentes
                  </span>
                  {dept.lead && (
                    <span className="text-xs px-3 py-1 rounded-full bg-cyan-950/30 text-cyan-300 border border-cyan-900/50 font-medium hidden sm:inline-block">
                      {dept.lead}
                    </span>
                  )}
                </div>
              </div>

              {/* Ramas de Agentes (Managers y subordinados / independientes) */}
              <div className="pl-6 border-l-2 border-cyan-500/30 space-y-3">
                {deptAgents.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-1">
                    No hay agentes asignados a este departamento aún.
                  </p>
                ) : (
                  <>
                    {/* 1. Nodos Managers */}
                    {managers.map(mgr => {
                      const subs = deptAgents.filter(a => mgr.subordinateIds?.includes(a.id));
                      return (
                        <div key={mgr.id} className="bg-[#0b101d]/80 p-4 rounded-lg border border-cyan-500/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-lg">{mgr.avatar || '👨‍💼'}</span>
                              <div>
                                <h5 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                                  {mgr.name}
                                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                                    Manager / Orquestador
                                  </span>
                                </h5>
                                <p className="text-xs text-gray-400">{mgr.description}</p>
                              </div>
                            </div>

                            {onSelectAgent && (
                              <button
                                onClick={() => onSelectAgent(mgr)}
                                className="px-3 py-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs transition-all font-medium"
                              >
                                Conversar
                              </button>
                            )}
                          </div>

                          {/* Subordinados bajo el manager */}
                          {subs.length > 0 && (
                            <div className="pl-4 border-l border-cyan-500/20 space-y-2 mt-2">
                              <p className="text-[10px] text-gray-400 uppercase font-mono tracking-wider">
                                Subordinados a cargo:
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {subs.map(sub => (
                                  <div
                                    key={sub.id}
                                    className="p-2.5 rounded bg-[#05070b] border border-cyan-950/70 flex items-center justify-between text-xs"
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <span>{sub.avatar || '🤖'}</span>
                                      <span className="text-gray-200 truncate">{sub.name}</span>
                                    </div>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 font-mono">
                                      {sub.provider.toUpperCase()} - {sub.model}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 2. Nodos Independientes que no están asignados como subordinados */}
                    {independents.map(agent => (
                      <div
                        key={agent.id}
                        className="bg-[#0b101d]/60 p-3.5 rounded-lg border border-cyan-950/40 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{agent.avatar || '🤖'}</span>
                          <div>
                            <h5 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                              {agent.name}
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-gray-800 text-gray-400 font-mono">
                                Independiente
                              </span>
                            </h5>
                            <p className="text-xs text-gray-400">{agent.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                            {agent.provider.toUpperCase()} • {agent.model}
                          </span>
                          {onSelectAgent && (
                            <button
                              onClick={() => onSelectAgent(agent)}
                              className="px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-700 text-xs transition-all"
                            >
                              Hablar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}