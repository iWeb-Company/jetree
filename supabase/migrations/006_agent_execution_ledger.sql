create table if not exists public.agent_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider public.provider_name not null,
  model text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  error_code text check (error_code is null or error_code in (
    'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_CREDENTIAL_REQUIRED',
    'PROVIDER_UNAVAILABLE', 'PROVIDER_EXECUTION_FAILED', 'MANAGER_DECISION_INVALID',
    'DELEGATION_TARGET_NOT_ALLOWED', 'AGENT_CONTEXT_TOO_LARGE', 'EMPTY_PROVIDER_RESPONSE',
    'PERSISTENCE_FAILED', 'EXECUTION_FAILED'
  )),
  input_chars integer not null check (input_chars between 1 and 8000),
  output_chars integer check (output_chars between 0 and 12000),
  delegation jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_executions_user_created_idx
  on public.agent_executions(user_id, created_at desc);
create index if not exists agent_executions_department_created_idx
  on public.agent_executions(department_id, created_at desc);
create index if not exists agent_executions_conversation_created_idx
  on public.agent_executions(conversation_id, created_at desc);

alter table public.agent_executions enable row level security;
create policy agent_executions_visible on public.agent_executions for select using (
  public.is_workspace_admin()
  or user_id = auth.uid()
  or public.is_department_member(department_id)
);
revoke all on public.agent_executions from anon, authenticated;
grant select on public.agent_executions to authenticated;
grant all on public.agent_executions to service_role;

alter table public.messages
  add column if not exists execution_id uuid references public.agent_executions(id) on delete set null;
create index if not exists messages_execution_idx on public.messages(execution_id);

-- Jetree currently has one iWeb workspace. This atomic daily cap protects that
-- shared workspace until first-class workspace records are introduced.
create table if not exists public.workspace_daily_execution_usage (
  usage_date date primary key,
  executions integer not null default 0 check (executions >= 0),
  updated_at timestamptz not null default now()
);
alter table public.workspace_daily_execution_usage enable row level security;
revoke all on public.workspace_daily_execution_usage from anon, authenticated;
grant all on public.workspace_daily_execution_usage to service_role;

create or replace function public.consume_workspace_execution_quota(max_runs integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if max_runs is null or max_runs < 1 then
    raise exception 'A positive daily execution limit is required';
  end if;

  insert into public.workspace_daily_execution_usage (usage_date, executions)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict (usage_date) do update
    set executions = public.workspace_daily_execution_usage.executions + 1,
        updated_at = now()
    where public.workspace_daily_execution_usage.executions < max_runs
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.consume_workspace_execution_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_workspace_execution_quota(integer) to service_role;
