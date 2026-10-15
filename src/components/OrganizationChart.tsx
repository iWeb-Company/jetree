'use client';

import React, { useState } from 'react';
import type { Agent, Department, Task } from '@/types';
import { normalizeOrganizationSearch, organizationDepartments, visibleSubordinates } from '@/lib/organization-chart';

const statusLabels = { idle: 'Disponible', working: 'Trabajando', offline: 'Sin conexión' };

export default function OrganizationChart({ departments, agents, tasks, onChat, onEdit }: {
  departments: Department[]; agents: Agent[]; tasks: Task[];
  onChat: (agent: Agent) => void; onEdit: (agent: Agent) => void;
}) {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [workingOnly, setWorkingOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);
  const isWorking = (agent: Agent) => agent.status === 'working' || tasks.some(task => task.assignedAgentId === agent.id && task.status === 'in_progress');
  const matches = (agent: Agent) => normalizeOrganizationSearch(`${agent.name} ${agent.description} ${agent.model} ${agent.roleType === 'manager' ? 'manager' : 'agente'}`).includes(normalizeOrganizationSearch(search)) && (!workingOnly || isWorking(agent));
  const groups = organizationDepartments(departments, agents).filter(group => departmentId === 'all' || group.department.id === departmentId);
  const toggle = (id: string) => setCollapsed(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const agentCard = (agent: Agent) => {
    const working = isWorking(agent);
    const children = visibleSubordinates(agent, agents);
    return <article key={agent.id} data-testid="org-agent" className={`w-64 shrink-0 rounded-xl border p-4 ${working ? 'border-emerald-500/70 bg-emerald-950/20' : agent.roleType === 'manager' ? 'border-cyan-700 bg-cyan-950/20' : 'border-slate-700 bg-[#0b1421]'}`}>
      <div className="flex items-center justify-between gap-2 text-[10px]"><span className="uppercase tracking-wider text-cyan-300">{agent.roleType === 'manager' ? 'Manager' : 'Agente'}</span><span className={working ? 'text-emerald-300' : 'text-gray-400'}>{working ? '● Trabajando' : statusLabels[agent.status]}</span></div>
      <h4 className="mt-2 break-words font-semibold text-white">{agent.avatar || (agent.roleType === 'manager' ? '◈' : '◇')} {agent.name}</h4>
      <p className="mt-1 line-clamp-2 text-xs text-gray-400">{agent.description || 'Sin descripción'}</p>
      <p className="mt-2 break-all text-[10px] text-gray-500">{agent.model}</p>
      {agent.roleType === 'manager' && <div className="mt-4 border-t border-cyan-900/60 pt-3"><p className="mb-2 text-[10px] uppercase text-gray-400">Equipo autorizado · {children.length}</p>{children.length ? <ul className="space-y-2 border-l border-cyan-700 pl-3">{children.map(child => <li key={child.id}><button onClick={() => onChat(child)} className="text-left text-xs text-cyan-200 hover:underline"><span aria-hidden="true">↳ </span>{child.name}{child.departmentId !== agent.departmentId && <span className="text-gray-400"> · otro departamento</span>}{isWorking(child) && <span className="text-emerald-300"> · trabajando</span>}</button></li>)}</ul> : <p className="text-xs text-gray-500">Sin agentes asignados</p>}</div>}
      <div className="mt-4 flex gap-3 text-xs"><button onClick={() => onChat(agent)} className="rounded bg-cyan-500/15 px-3 py-2 text-cyan-200">Conversar</button><button onClick={() => onEdit(agent)} className="rounded px-2 py-2 text-gray-300 hover:bg-gray-800">Configurar</button></div>
    </article>;
  };
  return <section aria-labelledby="organization-title" className="space-y-5">
    <div><h3 id="organization-title" className="text-xl font-semibold">Organigrama</h3><p className="mt-1 text-sm text-gray-400">Departamentos, managers y equipos. Las líneas muestran asignaciones; un agente puede participar en más de un equipo.</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cyan-950 bg-[#0b101d] p-4">
      <label className="min-w-0 flex-1 text-xs text-gray-400">Buscar departamento, agente o modelo<input value={search} onChange={event => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-sm text-white" placeholder="Nombre, objetivo o modelo…" /></label>
      <label className="text-xs text-gray-400">Departamento<select value={departmentId} onChange={event => setDepartmentId(event.target.value)} className="mt-1 block max-w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-sm text-white"><option value="all">Todos</option>{organizationDepartments(departments, agents).map(group => <option key={group.department.id} value={group.department.id}>{group.department.name}</option>)}</select></label>
      <label className="flex items-center gap-2 py-2 text-xs text-gray-300"><input type="checkbox" checked={workingOnly} onChange={event => setWorkingOnly(event.target.checked)} />Solo trabajando</label>
      <div className="flex items-center gap-2"><button aria-label="Alejar organigrama" onClick={() => setZoom(value => Math.max(70, value - 10))} className="rounded border border-gray-700 px-3 py-2">−</button><button onClick={() => setZoom(100)} className="text-xs text-gray-300" aria-label="Restablecer zoom">{zoom}%</button><button aria-label="Acercar organigrama" onClick={() => setZoom(value => Math.min(140, value + 10))} className="rounded border border-gray-700 px-3 py-2">+</button></div>
    </div>
    <p className="text-xs text-gray-500">Desplazate dentro del lienzo para recorrer el equipo. El estado se actualiza con la actividad del panel; no indica presencia humana.</p>
    <div tabIndex={0} aria-label="Lienzo desplazable del organigrama" className="max-h-[72vh] overflow-auto rounded-2xl border border-cyan-950 bg-[#070d17] p-5" style={{ backgroundImage: 'radial-gradient(#163041 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div style={{ zoom: zoom / 100 }} className="min-w-fit space-y-8">
        <div className="ml-5 w-60 rounded-xl border border-cyan-600 bg-[#0b202c] p-4 text-center"><p className="font-semibold text-cyan-200">Jetree · Equipo</p><p className="text-xs text-gray-400">{agents.filter(agent => !agent.deletedAt).length} agentes visibles</p></div>
        {groups.map(({ department, agents: departmentAgents }) => {
          const departmentMatch = normalizeOrganizationSearch(department.name).includes(normalizeOrganizationSearch(search));
          const shown = departmentAgents.filter(agent => (departmentMatch && (!workingOnly || isWorking(agent))) || matches(agent) || (agent.roleType === 'manager' && visibleSubordinates(agent, agents).some(matches)));
          if ((search || workingOnly) && !shown.length && !(departmentMatch && !workingOnly)) return null;
          const closed = collapsed.includes(department.id) && !search && !workingOnly;
          const managers = shown.filter(agent => agent.roleType === 'manager');
          const managed = new Set(managers.flatMap(manager => visibleSubordinates(manager, shown).filter(agent => agent.roleType !== 'manager').map(agent => agent.id)));
          const roots = [...managers, ...shown.filter(agent => agent.roleType !== 'manager' && !managed.has(agent.id))];
          return <section key={department.id} className="border-l-2 border-cyan-800 pl-5"><button aria-expanded={!closed} onClick={() => toggle(department.id)} className="mb-5 flex w-72 max-w-full items-center gap-3 rounded-xl border border-cyan-800 bg-[#0d1b29] p-4 text-left"><span>{closed ? '+' : '−'}</span><span className="min-w-0"><span className="block break-words font-semibold">{department.icon || '▦'} {department.name}</span><span className="text-xs text-gray-400">{departmentAgents.length} agentes · {departmentAgents.filter(isWorking).length} trabajando</span></span></button>{!closed && <div className="ml-3 flex items-start gap-8 border-l border-cyan-900 pl-5">{roots.map(agent => <div key={agent.id} className="flex flex-col items-center"><div className="h-5 border-l border-cyan-800" />{agentCard(agent)}{agent.roleType === 'manager' && visibleSubordinates(agent, shown).some(child => child.departmentId === department.id && child.roleType !== 'manager') && <><div className="h-7 border-l border-cyan-600" /><div className="flex items-start gap-5 border-t border-cyan-700">{visibleSubordinates(agent, shown).filter(child => child.departmentId === department.id && child.roleType !== 'manager').map(child => <div key={child.id} className="flex flex-col items-center"><div className="h-6 border-l border-cyan-700" />{agentCard(child)}</div>)}</div></>}</div>)}{!shown.length && <p className="text-sm text-gray-500">Todavía no hay agentes en este departamento.</p>}</div>}</section>;
        })}
        {!groups.some(group => group.agents.some(matches) || (!workingOnly && normalizeOrganizationSearch(group.department.name).includes(normalizeOrganizationSearch(search)))) && <p role="status" className="text-sm text-gray-400">No hay resultados para estos filtros.</p>}
        {!departments.length && !agents.length && <p className="text-sm text-gray-400">Creá un departamento y sus agentes para visualizar la estructura.</p>}
      </div>
    </div>
  </section>;
}
