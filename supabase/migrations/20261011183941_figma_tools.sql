alter table public.tool_connections drop constraint tool_connections_provider_check;
alter table public.tool_connections add constraint tool_connections_provider_check check (provider in ('github','google_drive','gmail','figma'));
alter table public.tool_connection_audit drop constraint tool_connection_audit_provider_check;
alter table public.tool_connection_audit add constraint tool_connection_audit_provider_check check (provider in ('github','google_drive','gmail','figma'));
alter table public.agent_tool_approvals drop constraint agent_tool_approvals_provider_check;
alter table public.agent_tool_approvals add constraint agent_tool_approvals_provider_check check (provider in ('github','google_drive','gmail','web_search','figma'));
alter table public.agent_tool_calls drop constraint agent_tool_calls_provider_check;
alter table public.agent_tool_calls add constraint agent_tool_calls_provider_check check (provider in ('github','google_drive','gmail','web_search','figma'));

create table public.figma_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  file_key text not null check (file_key ~ '^[A-Za-z0-9]{6,128}$'),
  name text not null, created_at timestamptz not null default now(),
  primary key (user_id, file_key)
);
create table public.figma_pair_codes (
  code_hash text primary key, user_id uuid not null, file_key text not null,
  expires_at timestamptz not null,
  foreign key (user_id,file_key) references public.figma_files on delete cascade
);
create table public.figma_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, file_key text not null,
  token_hash text not null unique, marker text not null, verified boolean not null default false,
  expires_at timestamptz not null, revoked_at timestamptz, last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id,file_key) references public.figma_files on delete cascade
);
create table public.figma_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, file_key text not null,
  agent_id uuid references public.agents(id) on delete set null,
  approval_id uuid not null unique references public.agent_tool_approvals(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  commands jsonb not null check (jsonb_typeof(commands) = 'array' and jsonb_array_length(commands) between 1 and 25 and octet_length(commands::text) <= 16000),
  summary text not null check (length(summary) <= 500),
  status text not null default 'queued' check (status in ('queued','leased','applied','failed','uncertain','cancelled')),
  session_id uuid references public.figma_sessions(id) on delete set null,
  lease_until timestamptz, result jsonb, error_code text,
  preview_path text, notified_at timestamptz,
  created_at timestamptz not null default now(), finished_at timestamptz,
  foreign key (user_id,file_key) references public.figma_files on delete cascade
);
create index figma_jobs_queue_idx on public.figma_jobs(user_id,file_key,created_at,id) where status in ('queued','leased','uncertain');
create index figma_jobs_file_active_idx on public.figma_jobs(file_key) where status in ('leased','uncertain');
create index figma_sessions_owner_idx on public.figma_sessions(user_id,expires_at);
create index figma_jobs_agent_idx on public.figma_jobs(agent_id);
create index figma_jobs_conversation_idx on public.figma_jobs(conversation_id);
create index figma_jobs_session_idx on public.figma_jobs(session_id);

-- The browser never writes jobs, sessions or secrets directly.
alter table public.figma_files enable row level security;
alter table public.figma_pair_codes enable row level security;
alter table public.figma_sessions enable row level security;
alter table public.figma_jobs enable row level security;
revoke all on public.figma_files, public.figma_pair_codes, public.figma_sessions, public.figma_jobs from anon, authenticated;
grant all on public.figma_files, public.figma_pair_codes, public.figma_sessions, public.figma_jobs to service_role;

-- Minimal PostgreSQL CI has no Storage service. Real Supabase environments do.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('figma-previews','figma-previews',false,5242880,array['image/png']) on conflict (id) do nothing;
  end if;
end $$;

-- File row lock serializes all agents and plugin instances for the same file.
-- An expired lease is uncertain: never replay a canvas mutation automatically.
create function public.claim_figma_job(p_session_id uuid, p_user_id uuid)
returns setof public.figma_jobs language plpgsql security invoker set search_path = '' as $$
declare s public.figma_sessions; j public.figma_jobs;
begin
  select * into s from public.figma_sessions where id=p_session_id and user_id=p_user_id
    and revoked_at is null and verified and expires_at>now();
  if not found then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.file_key,0));
  perform 1 from public.figma_files where user_id=s.user_id and file_key=s.file_key for update;
  if not exists (select 1 from public.tool_connections where user_id=s.user_id and provider='figma' and status='connected') then return; end if;
  update public.figma_sessions set last_seen_at=now() where id=s.id;
  update public.figma_jobs set status='uncertain', error_code='FIGMA_LEASE_EXPIRED'
    where user_id=s.user_id and file_key=s.file_key and status='leased' and lease_until<now();
  if exists (select 1 from public.figma_jobs where file_key=s.file_key and status in ('leased','uncertain')) then return; end if;
  -- Recheck approval, agent permissions and department membership when executing.
  update public.figma_jobs q set status='cancelled',error_code='FIGMA_ACCESS_REVOKED',finished_at=now()
    where q.user_id=s.user_id and q.file_key=s.file_key and q.status='queued' and not exists (
      select 1 from public.agent_tool_approvals p join public.agents a on a.id=q.agent_id
      join public.departments d on d.id=a.department_id
      where p.id=q.approval_id and p.user_id=q.user_id and p.agent_id=q.agent_id and p.status in ('completed','executing')
        and a.deleted_at is null and d.deleted_at is null and 'plugin-figma-core'=any(a.enabled_tool_ids)
        and (d.created_by=q.user_id or exists(select 1 from public.profiles where id=q.user_id and role='admin')
          or exists(select 1 from public.department_members where department_id=d.id and user_id=q.user_id))
    );
  select q.* into j from public.figma_jobs q join public.agent_tool_approvals p on p.id=q.approval_id
    where q.user_id=s.user_id and q.file_key=s.file_key and q.status='queued' and p.status='completed'
    order by q.created_at,q.id limit 1 for update of q;
  if not found then return; end if;
  return query update public.figma_jobs set status='leased',session_id=s.id,lease_until=now()+interval '3 minutes'
    where id=j.id and status='queued' returning *;
end $$;
revoke all on function public.claim_figma_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_figma_job(uuid,uuid) to service_role;
