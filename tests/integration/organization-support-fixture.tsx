import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import OrganizationChart from '../../src/components/OrganizationChart';
import SupportChat from '../../src/components/SupportChat';
import type { Agent } from '../../src/types';

const base: Agent = { id: 'manager', name: 'Manager de operaciones', roleType: 'manager', departmentId: 'ops', description: 'Coordina reportes', provider: 'groq', model: 'modelo-sintetico', systemPrompt: '', status: 'idle', subordinateIds: ['one', 'two', 'manager'] };
const agents: Agent[] = [base, { ...base, id: 'one', name: 'Analista de métricas', roleType: 'independent', status: 'working' }, { ...base, id: 'two', name: 'Especialista comercial', departmentId: 'sales', roleType: 'independent' }, { ...base, id: 'empty', name: 'Manager sin equipo', departmentId: 'sales', subordinateIds: [] }];
function App() {
  const [action, setAction] = useState('');
  return <main className="min-h-screen bg-[#05070b] p-4 pb-28 text-gray-100"><OrganizationChart departments={[{ id: 'ops', name: 'Operaciones', description: '' }, { id: 'sales', name: 'Comercial', description: '' }]} agents={agents} tasks={[]} onChat={agent => setAction('chat:' + agent.id)} onEdit={agent => setAction('edit:' + agent.id)} /><p role="status" data-testid="action">{action}</p><SupportChat onNavigate={setAction} /></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
