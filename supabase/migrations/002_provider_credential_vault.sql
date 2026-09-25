-- User-owned provider API keys are encrypted by the application and stored
-- separately from connection metadata. Only the server service role may read them.
alter type public.provider_name add value if not exists 'custom';

alter table public.provider_connections
  add column if not exists connection_type text not null default 'api_key';

alter table public.provider_connections
  drop constraint if exists provider_connections_status_check;

alter table public.provider_connections
  add constraint provider_connections_status_check
  check (status in ('configured', 'connected', 'expired', 'error', 'disconnected'));

alter table public.provider_connections
  drop constraint if exists provider_connections_connection_type_check;

alter table public.provider_connections
  add constraint provider_connections_connection_type_check
  check (connection_type in ('api_key', 'official_runtime'));

create table if not exists public.provider_connection_secrets (
  connection_id uuid primary key references public.provider_connections(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  updated_at timestamptz not null default now()
);

alter table public.provider_connection_secrets enable row level security;

revoke all on public.provider_connection_secrets from anon, authenticated;
grant all on public.provider_connection_secrets to service_role;

-- Authenticated users can read only connection metadata, never ciphertext fields
-- from the legacy table. Writes go through the authenticated server routes.
revoke all on public.provider_connections from anon, authenticated;
grant select (id, user_id, provider, status, metadata, connected_at, updated_at, connection_type)
  on public.provider_connections to authenticated;

-- Qualify the outer table columns in membership checks to avoid comparing a
-- membership row to itself, which would otherwise expose unrelated agents/tasks.
drop policy if exists agents_visible on public.agents;
create policy agents_visible on public.agents for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.department_members m
    where m.department_id = public.agents.department_id and m.user_id = auth.uid()
  )
);

drop policy if exists tasks_visible on public.tasks;
create policy tasks_visible on public.tasks for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.department_members m
    where m.department_id = public.tasks.department_id and m.user_id = auth.uid()
  )
);
