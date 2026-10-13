-- Coding tokens and reports are accessible only through scoped server APIs.
create table public.coding_pair_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index coding_pair_owner_idx on public.coding_pair_codes(user_id);
create table public.coding_executors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, revoked_at timestamptz, last_seen_at timestamptz,
  created_at timestamptz not null default now(), unique(id,user_id)
);
create index coding_executor_owner_idx on public.coding_executors(user_id);
create table public.coding_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  executor_id uuid not null, local_id text not null check (local_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  name text not null check (length(name) between 1 and 80),
  models jsonb not null check (jsonb_typeof(models)='array' and jsonb_array_length(models) between 1 and 10 and octet_length(models::text)<=4000),
  test_command text not null check (length(test_command) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique(id,user_id,executor_id), unique(executor_id,local_id),
  foreign key(executor_id,user_id) references public.coding_executors(id,user_id) on delete cascade
);
create index coding_project_owner_idx on public.coding_projects(user_id);
create table public.coding_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  executor_id uuid not null, project_id uuid not null,
  agent_id uuid references public.agents(id) on delete set null,
  request_id uuid not null, prompt text not null check(length(prompt) between 1 and 8000),
  provider text not null check(provider in ('groq','openrouter','deepseek')),
  model text not null check(model ~ '^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,150}$'),
  status text not null default 'queued' check(status in ('queued','preparing','running','verifying','ready_for_review','tests_failed','failed','interrupted','cancelled')),
  claim_id uuid, lease_until timestamptz, cancel_requested boolean not null default false,
  sequence integer not null default 0, events jsonb not null default '[]',
  report jsonb check(report is null or octet_length(report::text)<=500000),
  error_code text, created_at timestamptz not null default now(), finished_at timestamptz,
  unique(user_id,request_id),
  foreign key(project_id,user_id,executor_id) references public.coding_projects(id,user_id,executor_id) on delete cascade
);
create index coding_session_owner_idx on public.coding_sessions(user_id,created_at desc);
create index coding_session_agent_idx on public.coding_sessions(agent_id);
create index coding_session_executor_idx on public.coding_sessions(executor_id,created_at) where status in ('queued','preparing','running','verifying');
create index coding_session_project_idx on public.coding_sessions(project_id,user_id,executor_id);
alter table public.coding_pair_codes enable row level security;
alter table public.coding_executors enable row level security;
alter table public.coding_projects enable row level security;
alter table public.coding_sessions enable row level security;
revoke all on public.coding_pair_codes,public.coding_executors,public.coding_projects,public.coding_sessions from public,anon,authenticated;
grant all on public.coding_pair_codes,public.coding_executors,public.coding_projects,public.coding_sessions to service_role;

create function public.claim_coding_session(p_executor uuid,p_user uuid)
returns setof public.coding_sessions language plpgsql security invoker set search_path='' as $$
declare e public.coding_executors; j public.coding_sessions;
begin
  select * into e from public.coding_executors where id=p_executor and user_id=p_user and revoked_at is null and expires_at>now() for update;
  if not found then return; end if;
  update public.coding_executors set last_seen_at=now() where id=e.id;
  update public.coding_sessions set status='interrupted',error_code='EXECUTOR_DISCONNECTED',finished_at=now()
    where executor_id=e.id and status in ('preparing','running','verifying') and lease_until<now();
  if exists(select 1 from public.coding_sessions where executor_id=e.id and status in ('preparing','running','verifying')) then return; end if;
  select * into j from public.coding_sessions where executor_id=e.id and user_id=e.user_id and status='queued' and not cancel_requested order by created_at,id limit 1 for update;
  if not found then return; end if;
  return query update public.coding_sessions set status='preparing',claim_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',events=jsonb_build_array(jsonb_build_object('stage','preparing','at',now())) where id=j.id returning *;
end $$;
create function public.touch_coding_session(p_executor uuid,p_user uuid,p_job uuid,p_claim uuid,p_sequence integer,p_stage text)
returns setof public.coding_sessions language plpgsql security invoker set search_path='' as $$
declare j public.coding_sessions;
begin
  if p_stage not in ('preparing','running','verifying') or p_sequence not between 1 and 1000 then return; end if;
  perform 1 from public.coding_executors where id=p_executor and user_id=p_user and revoked_at is null and expires_at>now() for share;
  if not found then return; end if;
  select * into j from public.coding_sessions where id=p_job and user_id=p_user and executor_id=p_executor and claim_id=p_claim for update;
  if not found then return; end if;
  if j.status not in ('preparing','running','verifying') or j.lease_until<now() then return query select (j).*; return; end if;
  if p_sequence>j.sequence then
    -- Progress may only advance; stale deliveries cannot move it backwards.
    if (j.status='verifying' and p_stage<>'verifying') or (j.status='running' and p_stage='preparing') then p_stage:=j.status; end if;
    update public.coding_sessions set status=p_stage,sequence=p_sequence,lease_until=now()+interval '90 seconds',events=case when j.status<>p_stage and jsonb_array_length(j.events)<100 then j.events||jsonb_build_array(jsonb_build_object('stage',p_stage,'at',now())) else j.events end where id=j.id returning * into j;
  end if;
  update public.coding_executors set last_seen_at=now() where id=p_executor;
  return query select (j).*;
end $$;
create function public.finish_coding_session(p_executor uuid,p_user uuid,p_job uuid,p_claim uuid,p_status text,p_report jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.coding_sessions;
begin
  if p_status not in ('ready_for_review','tests_failed','failed','interrupted','cancelled') then return false; end if;
  perform 1 from public.coding_executors where id=p_executor and user_id=p_user and revoked_at is null and expires_at>now() for share;
  if not found then return false; end if;
  select * into j from public.coding_sessions where id=p_job and user_id=p_user and executor_id=p_executor and claim_id=p_claim for update;
  if not found then return false; end if;
  if j.status in ('ready_for_review','tests_failed','failed','cancelled') then return true; end if;
  -- Late results from the same claim reconcile a disconnection, never run again.
  if j.cancel_requested then p_status:='cancelled'; p_report:=null; end if;
  update public.coding_sessions set status=p_status,report=p_report,error_code=p_error,finished_at=now(),events=events||jsonb_build_array(jsonb_build_object('stage',p_status,'at',now())) where id=j.id;
  return true;
end $$;
revoke all on function public.claim_coding_session(uuid,uuid),public.touch_coding_session(uuid,uuid,uuid,uuid,integer,text),public.finish_coding_session(uuid,uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_coding_session(uuid,uuid),public.touch_coding_session(uuid,uuid,uuid,uuid,integer,text),public.finish_coding_session(uuid,uuid,uuid,uuid,text,jsonb,text) to service_role;
