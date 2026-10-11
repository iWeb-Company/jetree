import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCompletedTasks } from '../src/lib/task-groups';
import type { Task } from '../src/types';

test('completed tasks remain separate by department and agent, including unassigned tasks', () => {
  const task = (id: string, departmentId?: string, assignedAgentId?: string, status: Task['status'] = 'completed'): Task => ({ id, departmentId, assignedAgentId, status, title: id, description: '', createdAt: '' });
  const groups = groupCompletedTasks([task('1', 'a', 'x'), task('2', 'b', 'x'), task('3', 'a', 'y'), task('4'), task('5', 'a', 'x', 'pending')]);
  assert.deepEqual(groups.map(item => [item.departmentId, item.count]), [['a', 2], ['b', 1], ['', 1]]);
  assert.deepEqual(groups[0].agents.map(item => item.agentId), ['x', 'y']);
  assert.deepEqual(groups.flatMap(item => item.agents.flatMap(agent => agent.tasks.map(task => task.id))), ['1', '3', '2', '4']);
});
