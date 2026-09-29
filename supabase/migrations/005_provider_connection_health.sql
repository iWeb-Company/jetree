alter table public.provider_connections
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_error_code text;

alter table public.provider_connections
  drop constraint if exists provider_connections_last_error_code_check;
alter table public.provider_connections
  add constraint provider_connections_last_error_code_check
  check (last_error_code is null or last_error_code in (
    'invalid_credentials', 'rate_limited', 'provider_unavailable', 'network_error', 'unknown'
  ));

-- Keep a minimal, secret-free audit trail for credential lifecycle events.
create table if not exists public.provider_connection_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.provider_name not null,
  action text not null check (action in ('validated', 'validation_failed', 'revoked', 'saved')),
  result_code text check (result_code is null or result_code in (
    'invalid_credentials', 'rate_limited', 'provider_unavailable', 'network_error', 'unknown'
  )),
  created_at timestamptz not null default now()
);

create index if not exists provider_connection_audit_user_created_idx
  on public.provider_connection_audit(user_id, created_at desc);

alter table public.provider_connection_audit enable row level security;
revoke all on public.provider_connection_audit from anon, authenticated;
grant all on public.provider_connection_audit to service_role;

revoke all on public.provider_connections from anon, authenticated;
grant select (id, user_id, provider, status, metadata, connected_at, updated_at, connection_type, last_checked_at, last_error_code)
  on public.provider_connections to authenticated;
