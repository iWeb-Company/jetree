-- Remove unnecessary API entry points without changing triggers or RLS predicates.
-- Revoke explicit Supabase role grants as well as inherited PUBLIC privileges.
revoke execute on function public.handle_new_user(),
  public.add_department_creator_as_member(),
  public.validate_agent_subordinates(),
  public.validate_task_agent_department()
from public, anon, authenticated;

grant execute on function public.handle_new_user(),
  public.add_department_creator_as_member(),
  public.validate_agent_subordinates(),
  public.validate_task_agent_department()
to service_role;

-- These helpers inspect auth.uid() and remain necessary for authenticated RLS.
revoke execute on function public.is_workspace_admin(),
  public.is_department_member(uuid), public.can_use_department(uuid)
from public, anon;

grant execute on function public.is_workspace_admin(),
  public.is_department_member(uuid), public.can_use_department(uuid)
to authenticated, service_role;
