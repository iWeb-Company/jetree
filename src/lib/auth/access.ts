export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
  'facundod@iwebtecnology.com,valentind@iwebtecnology.com,tomasb@iwebtecnology.com')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

export function isWorkspaceAdmin(email?: string | null): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}

export function canAccessDepartment(
  email: string | null | undefined,
  departmentId: string,
  allowedDepartmentIds: string[] = [],
): boolean {
  return isWorkspaceAdmin(email) || allowedDepartmentIds.includes(departmentId);
}
