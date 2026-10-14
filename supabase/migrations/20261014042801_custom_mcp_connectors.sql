create table public.custom_mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 100),
  url text not null check(length(url) between 1 and 2048),
  transport text not null default 'auto' check(transport in ('auto','streamable_http','sse')),
  auth_mode text not null check(auth_mode in ('none','token','oauth')),
  status text not null default 'disconnected' check(status in ('disconnected','connected','auth_required','error','revoked')),
  ciphertext text not null, iv text not null, auth_tag text not null,
  tools jsonb not null default '[]' check(jsonb_typeof(tools)='array' and jsonb_array_length(tools)<=500 and octet_length(tools::text)<=1048576),
  read_only_tools jsonb not null default '{}',
  capabilities jsonb not null default '{}',
  configuration_version integer not null default 1,
  lock_ticket uuid, lock_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create index custom_mcp_owner_idx on public.custom_mcp_connections(user_id);
alter table public.custom_mcp_connections enable row level security;
revoke all on public.custom_mcp_connections from public,anon,authenticated;
grant all on public.custom_mcp_connections to service_role;

create table public.custom_mcp_agent_access (
  connection_id uuid not null, user_id uuid not null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  primary key(connection_id,agent_id),
  foreign key(connection_id,user_id) references public.custom_mcp_connections(id,user_id) on delete cascade
);
create index custom_mcp_access_owner_idx on public.custom_mcp_agent_access(user_id,agent_id,connection_id);
create index custom_mcp_access_agent_idx on public.custom_mcp_agent_access(agent_id);
create index custom_mcp_access_connection_owner_idx on public.custom_mcp_agent_access(connection_id,user_id);
alter table public.custom_mcp_agent_access enable row level security;
revoke all on public.custom_mcp_agent_access from public,anon,authenticated;
grant all on public.custom_mcp_agent_access to service_role;

create table public.custom_mcp_oauth_states (
  state_hash text primary key, connection_id uuid not null, user_id uuid not null,
  configuration_version integer not null, expires_at timestamptz not null,
  foreign key(connection_id,user_id) references public.custom_mcp_connections(id,user_id) on delete cascade
);
create index custom_mcp_state_connection_owner_idx on public.custom_mcp_oauth_states(connection_id,user_id);
create index custom_mcp_state_owner_idx on public.custom_mcp_oauth_states(user_id);
alter table public.custom_mcp_oauth_states enable row level security;
revoke all on public.custom_mcp_oauth_states from public,anon,authenticated;
grant all on public.custom_mcp_oauth_states to service_role;

create function public.lock_custom_mcp_connection(p_connection uuid,p_user uuid,p_ticket uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.custom_mcp_connections set lock_ticket=p_ticket,lock_until=now()+interval '75 seconds'
  where id=p_connection and user_id=p_user and status<>'revoked' and (lock_until is null or lock_until<now());
  return found;
end $$;
revoke all on function public.lock_custom_mcp_connection(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_custom_mcp_connection(uuid,uuid,uuid) to service_role;

alter table public.agent_tool_approvals drop constraint agent_tool_approvals_provider_check;
alter table public.agent_tool_approvals add constraint agent_tool_approvals_provider_check check(provider in ('github','google_drive','gmail','web_search','figma','custom_mcp'));
alter table public.agent_tool_calls drop constraint agent_tool_calls_provider_check;
alter table public.agent_tool_calls add constraint agent_tool_calls_provider_check check(provider in ('github','google_drive','gmail','web_search','figma','custom_mcp'));
