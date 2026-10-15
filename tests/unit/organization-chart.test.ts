import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationDepartments, visibleSubordinates, normalizeOrganizationSearch } from '../../src/lib/organization-chart';
import type { Agent } from '../../src/types';
const base: Agent = { id: 'a', name: 'Agente', departmentId: 'd', roleType: 'manager', provider: 'groq', model: 'test', systemPrompt: '', description: '', status: 'idle' };
test('organization links ignore hidden, duplicate and self references without recursive cycles', () => {
  const manager = { ...base, subordinateIds: ['a', 'b', 'b', 'hidden', 'deleted'] };
  const child = { ...base, id: 'b', departmentId: 'other', subordinateIds: ['a'] };
  assert.deepEqual(visibleSubordinates(manager, [manager, child, { ...base, id: 'deleted', deletedAt: 'today' }]).map(agent => agent.id), ['b']);
  assert.equal(visibleSubordinates({ ...manager, roleType: 'independent' }, [child]).length, 0);
});
test('organization excludes archives and retains authorized agents with unavailable department', () => {
  const groups = organizationDepartments([{ id: 'd', name: 'Ventas', description: '' }, { id: 'old', name: 'Old', description: '', deleted_at: 'today' }], [base, { ...base, id: 'other', departmentId: 'unknown' }, { ...base, id: 'deleted', deletedAt: 'today' }]);
  assert.deepEqual(groups.map(group => group.agents.length), [1, 1]);
  assert.equal(normalizeOrganizationSearch('CÓDIGO'), 'codigo');
});
