import type { Agent, Department } from '@/types';

export const normalizeOrganizationSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function organizationDepartments(departments: Department[], agents: Agent[]) {
  const visible = departments.filter(department => !department.deleted_at);
  const ids = new Set(visible.map(department => department.id));
  const active = agents.filter(agent => !agent.deletedAt);
  return [
    ...visible.map(department => ({ department, agents: active.filter(agent => agent.departmentId === department.id) })),
    ...(active.some(agent => !ids.has(agent.departmentId)) ? [{ department: { id: '__unassigned', name: 'Sin departamento visible', description: '' }, agents: active.filter(agent => !ids.has(agent.departmentId)) }] : []),
  ];
}

// A manager may reference another manager, itself or a shared subordinate.
// Keep links explicit rather than inventing a single reporting line or recursing indefinitely.
export function visibleSubordinates(manager: Agent, agents: Agent[]) {
  if (manager.roleType !== 'manager') return [];
  const ids = new Set(manager.subordinateIds || []);
  return agents.filter(agent => !agent.deletedAt && agent.id !== manager.id && ids.has(agent.id));
}
