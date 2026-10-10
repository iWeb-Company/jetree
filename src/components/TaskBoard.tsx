'use client';

import React from 'react';
import { groupCompletedTasks } from '@/lib/task-groups';
import { Task, Department, Agent } from '@/types';

interface TaskBoardProps {
  tasks: Task[];
  departments?: Department[];
  agents?: Agent[];
  selectedDepartmentId?: string;
  onSelectDepartment?: (deptId: string) => void;
  onUpdateStatus?: (taskId: string, newStatus: Task['status']) => void;
}

export default function TaskBoard({
  tasks,
  departments = [],
  agents = [],
  selectedDepartmentId = 'all',
  onSelectDepartment,
  onUpdateStatus,
}: TaskBoardProps) {
  // Filtrar tareas según el departamento seleccionado
  const filteredTasks = selectedDepartmentId === 'all'
    ? tasks
    : tasks.filter(t => t.departmentId === selectedDepartmentId);

  const columns: { key: Task['status']; title: string; badgeColor: string; dotColor: string }[] = [
    { key: 'pending', title: 'Por Iniciar / Telegram', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dotColor: 'bg-amber-400' },
    { key: 'in_progress', title: 'En Proceso / Asignada', badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', dotColor: 'bg-cyan-400' },
    { key: 'completed', title: 'Completadas / Entregadas', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dotColor: 'bg-emerald-400' },
    { key: 'failed', title: 'Fallidas', badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dotColor: 'bg-rose-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Barra de Filtro de Tareas por Departamento */}
      {onSelectDepartment && departments.length > 0 && (
        <div className="p-3 bg-[#0b101d] border border-cyan-950/60 rounded-xl flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-gray-400 font-mono pl-1">Filtrar Tareas por Área:</span>
          <button
            onClick={() => onSelectDepartment('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              selectedDepartmentId === 'all'
                ? 'bg-cyan-500 text-black font-semibold shadow-sm shadow-cyan-500/20'
                : 'bg-[#05070b] text-gray-400 border border-cyan-950 hover:text-white'
            }`}
          >
            Todas ({tasks.length})
          </button>
          {departments.map(dept => {
            const count = tasks.filter(t => t.departmentId === dept.id).length;
            return (
              <button
                key={dept.id}
                onClick={() => onSelectDepartment(dept.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedDepartmentId === dept.id
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
      )}

      {/* Columnas Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map(col => {
          const colTasks = filteredTasks.filter(t => (t.status || 'pending') === col.key);

          return (
            <div key={col.key} className="bg-[#0b101d] border border-cyan-950/60 rounded-xl p-4 flex flex-col justify-between">
              <div>
                {/* Header Columna */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-cyan-950/40">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dotColor}`}></span>
                    <h4 className="font-semibold text-white text-xs uppercase tracking-wider">{col.title}</h4>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${col.badgeColor}`}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Lista de Tareas */}
                <div className="space-y-2.5 min-h-[140px]">
                  {colTasks.length === 0 ? (
                    <div className="h-32 flex items-center justify-center border border-dashed border-cyan-950/40 rounded-lg text-gray-600 text-xs text-center p-4">
                      Sin tareas en esta etapa
                    </div>
                  ) : col.key === 'completed' ? (
                    groupCompletedTasks(colTasks).map(group => {
                      const dept = departments.find(item => item.id === group.departmentId);
                      return <details key={group.departmentId || 'unassigned'} className="rounded-xl border border-emerald-950/60 bg-[#05070b] p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-emerald-200">{dept ? `${dept.icon || ''} ${dept.name}` : group.departmentId ? 'Departamento no disponible' : 'Sin departamento'} <span className="text-gray-400">({group.count})</span></summary>
                        <div className="mt-3 space-y-2">
                          {group.agents.map(agentGroup => {
                            const agent = agents.find(item => item.id === agentGroup.agentId);
                            return <details key={agentGroup.agentId || 'unassigned'} className="rounded-lg border border-gray-800 p-2.5">
                              <summary className="cursor-pointer text-xs text-gray-200">{agent ? `${agent.avatar || ''} ${agent.name}` : agentGroup.agentId ? 'Agente no disponible' : 'Sin agente asignado'} <span className="text-gray-500">({agentGroup.tasks.length})</span></summary>
                              <div className="mt-2 space-y-2">{agentGroup.tasks.map(task => <details key={task.id} className="rounded-lg border border-gray-800 p-2.5">
                                <summary className="cursor-pointer text-xs text-gray-100">{task.title}{task.sourceChannel === 'telegram' && <span className="ml-2 text-[10px] text-blue-300">Telegram</span>}</summary>
                                <div className="mt-2 space-y-2 text-xs text-gray-400">
                                  {task.description && <p className="whitespace-pre-wrap break-words">{task.description}</p>}
                                  {task.result && <p className="whitespace-pre-wrap break-words">{task.result}</p>}
                                  {onUpdateStatus && <button onClick={() => onUpdateStatus(task.id, 'pending')} className="rounded bg-gray-900 px-2 py-1 text-gray-200">Reabrir</button>}
                                </div>
                              </details>)}</div>
                            </details>;
                          })}
                        </div>
                      </details>;
                    })
                  ) : (
                    colTasks.map(task => {
                      const dept = departments.find(d => d.id === task.departmentId);

                      return (
                        <div
                          key={task.id}
                          className="p-3.5 bg-[#05070b] border border-cyan-950/70 rounded-xl hover:border-cyan-800/80 transition-all space-y-2 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-medium text-gray-100 text-xs leading-snug">{task.title}</h5>
                            <div className="flex items-center gap-1 shrink-0">
                              {dept && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-900/50 font-mono">
                                  {dept.icon || '🌳'} {dept.name.split(' ')[0]}
                                </span>
                              )}
                              {task.sourceChannel === 'telegram' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-300 border border-blue-900/50 font-mono">
                                  Telegram
                                </span>
                              )}
                            </div>
                          </div>

                          {task.description && (
                            <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {task.status === 'failed' && task.lastError && (
                            <p className="text-[10px] text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2">Error: {task.lastError}</p>
                          )}
                          {(task.retryCount || task.traceId) && (
                            <div className="flex justify-between gap-2 text-[9px] text-gray-500 font-mono">
                              <span>{task.sourceChannel === 'telegram' ? `Reintentos: ${task.retryCount || 0}` : ''}</span>
                              {task.traceId && <span title={task.traceId}>Trace: {task.traceId.slice(0, 8)}</span>}
                            </div>
                          )}

                          {/* Transiciones de Estado Rápidas */}
                          {onUpdateStatus && (
                            <div className="pt-2 border-t border-cyan-950/40 flex items-center justify-between text-[10px]">
                              <span className="text-gray-500 font-mono">Mover:</span>
                              <div className="flex gap-1.5">
                                {col.key !== 'pending' && (
                                  <button
                                    onClick={() => onUpdateStatus(task.id, 'pending')}
                                    className="px-1.5 py-0.5 rounded bg-gray-900 text-gray-400 hover:text-white"
                                  >
                                    ← Pendiente
                                  </button>
                                )}
                                {col.key !== 'in_progress' && (
                                  <button
                                    onClick={() => onUpdateStatus(task.id, 'in_progress')}
                                    className="px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-900/40"
                                  >
                                    En Proceso
                                  </button>
                                )}
                                {col.key !== 'completed' && (
                                  <button
                                    onClick={() => onUpdateStatus(task.id, 'completed')}
                                    className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-900/40"
                                  >
                                    Completar ✓
                                  </button>
                                )}
                                {col.key === 'failed' && (
                                  <button onClick={() => onUpdateStatus(task.id, 'pending')} className="px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-900/40">Reabrir</button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
