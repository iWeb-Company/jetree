import type { Task } from '@/types';

export function groupCompletedTasks(tasks: Task[]) {
  const departments = new Map<string, Map<string, Task[]>>();
  for (const task of tasks) {
    if (task.status !== 'completed') continue;
    const departmentId = task.departmentId || '';
    const agentId = task.assignedAgentId || '';
    if (!departments.has(departmentId)) departments.set(departmentId, new Map());
    const agents = departments.get(departmentId)!;
    if (!agents.has(agentId)) agents.set(agentId, []);
    agents.get(agentId)!.push(task);
  }
  return [...departments].map(([departmentId, agents]) => ({ departmentId, count: [...agents.values()].reduce((sum, items) => sum + items.length, 0), agents: [...agents].map(([agentId, items]) => ({ agentId, tasks: items })) }));
}
