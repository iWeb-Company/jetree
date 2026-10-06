export function assertTelegramOwnerAccess(input: {
  profileRole: string | null;
  ownerId: string;
  departmentCreatorId: string;
  isMember: boolean;
  agentArchived: boolean;
  departmentArchived: boolean;
}) {
  if (input.agentArchived || input.departmentArchived) throw new Error('AGENT_OR_DEPARTMENT_ARCHIVED');
  if (!input.profileRole || (input.profileRole !== 'admin' && input.ownerId !== input.departmentCreatorId && !input.isMember)) {
    throw new Error('BOT_OWNER_ACCESS_REVOKED');
  }
}

export async function reserveTelegramExecution(
  configuredLimit: string | undefined,
  consume: (limit: number) => Promise<{ data: unknown; error: unknown }>,
) {
  const limit = Number(configuredLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('EXECUTION_LIMIT_NOT_CONFIGURED');
  const result = await consume(limit);
  if (result.error) throw new Error('EXECUTION_QUOTA_UNAVAILABLE');
  if (result.data !== true) throw new Error('WORKSPACE_EXECUTION_LIMIT_REACHED');
}
