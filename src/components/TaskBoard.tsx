'use client';

import React from 'react';
import { Task, Department } from '@/types';

interface TaskBoardProps {
  tasks: Task[];
  departments?: Department[];
  selectedDepartmentId?: string;
  onSelectDepartment?: (deptId: string) => void;
  onUpdateStatus?: (taskId: string, newStatus: Task['status']) => void;
}

export default function TaskBoard({
  tasks,
  departments = [],
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
