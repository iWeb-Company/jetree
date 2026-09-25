import { Agent, Department, AgentActivityLog } from '@/types';

export const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'department-1',
    name: 'Nuevo departamento',
    description: 'Edita este espacio para organizar tus agentes.',
    icon: '🌳',
  },
];

export const INITIAL_AGENTS: Agent[] = [];
export const INITIAL_LOGS: AgentActivityLog[] = [];
