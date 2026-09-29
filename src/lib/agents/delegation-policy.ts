import { Agent } from '@/types';

export function allowedSubordinates(manager: Agent, candidates: Agent[]): Agent[] {
  if (manager.roleType !== 'manager') return [];
  const ids = new Set(manager.subordinateIds || []);
  return candidates.filter(candidate =>
    ids.has(candidate.id)
    && candidate.id !== manager.id
    && candidate.departmentId === manager.departmentId
    && candidate.roleType === 'independent',
  );
}

export function resolveDelegationTarget(manager: Agent, candidates: Agent[], targetId: unknown): Agent {
  if (typeof targetId !== 'string') throw new Error('DELEGATION_TARGET_NOT_ALLOWED');
  const target = allowedSubordinates(manager, candidates).find(candidate => candidate.id === targetId);
  if (!target) throw new Error('DELEGATION_TARGET_NOT_ALLOWED');
  return target;
}
