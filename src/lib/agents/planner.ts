export type ManagerPlan =
  | { decision: 'direct'; managerNotes: string; directResponse: string }
  | { decision: 'delegate'; managerNotes: string; delegateTo: string; subTask: string };

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function parseManagerPlan(raw: string, allowedSubordinateIds: string[]): ManagerPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(raw));
  } catch {
    throw new Error('MANAGER_DECISION_INVALID');
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('MANAGER_DECISION_INVALID');
  const value = parsed as Record<string, unknown>;
  const managerNotes = typeof value.managerNotes === 'string' ? value.managerNotes.slice(0, 2000) : '';

  if (value.decision === 'direct') {
    if (typeof value.directResponse !== 'string' || !value.directResponse.trim()) {
      throw new Error('MANAGER_DECISION_INVALID');
    }
    return { decision: 'direct', managerNotes, directResponse: value.directResponse.trim().slice(0, 10000) };
  }

  if (value.decision === 'delegate') {
    if (typeof value.delegateTo !== 'string' || !allowedSubordinateIds.includes(value.delegateTo)) {
      throw new Error('DELEGATION_TARGET_NOT_ALLOWED');
    }
    if (typeof value.subTask !== 'string' || !value.subTask.trim() || value.subTask.length > 8000) {
      throw new Error('MANAGER_DECISION_INVALID');
    }
    return {
      decision: 'delegate',
      managerNotes,
      delegateTo: value.delegateTo,
      subTask: value.subTask.trim(),
    };
  }

  throw new Error('MANAGER_DECISION_INVALID');
}
