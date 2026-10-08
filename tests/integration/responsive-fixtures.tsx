import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AgentCard from '../../src/components/AgentCard';
import AgentModal from '../../src/components/AgentModal';
import AgentChatDrawer from '../../src/components/AgentChatDrawer';
import DepartmentTree from '../../src/components/DepartmentTree';
import TaskBoard from '../../src/components/TaskBoard';
import type { Agent, Department, Task } from '../../src/types';

const agent: Agent = { id: 'synthetic-agent', departmentId: 'synthetic-department', name: 'Agente de prueba con un nombre muy largo ' + 'L'.repeat(60), provider: 'gemini', model: 'gemini-model-' + 'm'.repeat(80), roleType: 'manager', description: 'Descripción ' + 'x'.repeat(120), systemPrompt: 'Prueba', status: 'idle', subordinateIds: [], enabledPluginIds: ['plugin-github-core'], telegramBot: { isActive: true, username: 'LongSyntheticTelegramUsername', token: '' } as Agent['telegramBot'] };
const departments: Department[] = [{ id: agent.departmentId, name: 'Departamento ' + 'd'.repeat(60), description: 'Descripción larga del departamento', icon: '🌳' }];
const task = { id: 'synthetic-task', title: 'Tarea ' + 't'.repeat(80), description: 'Descripción ' + 'z'.repeat(120), departmentId: agent.departmentId, status: 'pending', createdAt: new Date().toISOString() } as Task;
const noop = () => {};
const fixtures: Record<string, React.ReactNode> = {
  cards: <main className="p-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-5">{[agent, { ...agent, id: 'independent', roleType: 'independent' as const }].map(item => <AgentCard key={item.id} agent={item} onChat={noop} onEdit={noop} onDelete={noop} onConfigureTelegram={noop} />)}</main>,
  modal: <AgentModal isOpen onClose={noop} onSave={noop} departments={departments} existingAgents={[agent]} userSubscriptions={[]} agentToEdit={agent} />,
  chat: <AgentChatDrawer isOpen agent={agent} onClose={noop} availableAgents={[agent]} onNewLog={noop} />,
  departments: <main className="p-4"><DepartmentTree departments={departments} agents={[agent]} isAdmin onEditDepartment={noop} onManageMembers={noop} onDeleteDepartment={noop} /></main>,
  tasks: <main className="p-4"><TaskBoard tasks={[task]} departments={departments} selectedDepartmentId="all" onSelectDepartment={noop} /></main>,
};
const directory = resolve('work/responsive-fixtures');
mkdirSync(directory, { recursive: true });
const css = readFileSync('work/responsive.css', 'utf8');
for (const [name, component] of Object.entries(fixtures)) {
  writeFileSync(resolve(directory, name + '.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>' + renderToStaticMarkup(component) + '</body></html>');
}
console.log('Synthetic responsive fixtures generated; no accounts or provider calls.');
