create table if not exists public.tool_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github', 'google_drive')),
  status text not null default 'connected' check (status in ('connected', 'expired', 'error')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  account_label text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.tool_connections enable row level security;
revoke all on public.tool_connections from anon, authenticated;
grant all on public.tool_connections to service_role;

create table if not exists public.tool_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github', 'google_drive')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.tool_oauth_states enable row level security;
revoke all on public.tool_oauth_states from anon, authenticated;
grant all on public.tool_oauth_states to service_role;

create table if not exists public.tool_connection_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github', 'google_drive')),
  action text not null check (action in ('connected', 'revoked', 'refresh_failed')),
  created_at timestamptz not null default now()
);
create index if not exists tool_connection_audit_owner_idx on public.tool_connection_audit(user_id, created_at desc);
alter table public.tool_connection_audit enable row level security;
create policy tool_connection_audit_owner_read on public.tool_connection_audit for select using (user_id = auth.uid() or public.is_workspace_admin());
revoke all on public.tool_connection_audit from anon, authenticated;
grant select on public.tool_connection_audit to authenticated;
grant all on public.tool_connection_audit to service_role;

create table if not exists public.agent_tool_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  tool_id text not null,
  provider text not null check (provider in ('github', 'google_drive')),
  operation text not null,
  input jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'executing', 'approved', 'rejected', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  finished_at timestamptz
);
create index if not exists agent_tool_approvals_owner_idx on public.agent_tool_approvals(user_id, created_at desc);
alter table public.agent_tool_approvals enable row level security;
create policy agent_tool_approvals_owner_read on public.agent_tool_approvals for select using (user_id = auth.uid() or public.is_workspace_admin());
revoke all on public.agent_tool_approvals from anon, authenticated;
grant select on public.agent_tool_approvals to authenticated;
grant all on public.agent_tool_approvals to service_role;

create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  approval_id uuid references public.agent_tool_approvals(id) on delete set null,
  provider text not null check (provider in ('github', 'google_drive')),
  tool_id text not null,
  operation text not null,
  status text not null check (status in ('pending_approval', 'executing', 'succeeded', 'failed', 'rejected')),
  error_code text,
  result_summary text,
  cost_microunits bigint not null default 0 check (cost_microunits >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_tool_calls_owner_idx on public.agent_tool_calls(user_id, started_at desc);
create index if not exists agent_tool_calls_agent_idx on public.agent_tool_calls(agent_id, started_at desc);
alter table public.agent_tool_calls enable row level security;
create policy agent_tool_calls_owner_read on public.agent_tool_calls for select using (user_id = auth.uid() or public.is_workspace_admin());
revoke all on public.agent_tool_calls from anon, authenticated;
grant select on public.agent_tool_calls to authenticated;
grant all on public.agent_tool_calls to service_role;

-- Reap expired, one-time OAuth states without exposing them to browser clients.
delete from public.tool_oauth_states where expires_at < now();
