-- Private relay: provider OAuth credentials never enter this database.
create table public.model_device_pairs (
  token_hash text primary key check (length(token_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table public.model_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  name text not null check (length(name) between 1 and 80),
  provider text not null check (provider = 'gemini'),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.model_device_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  prompt text not null check (length(prompt) <= 24000),
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  response text check (length(response) <= 48000),
  claim_hash text,
  expires_at timestamptz not null default now() + interval '45 seconds',
  created_at timestamptz not null default now(),
  foreign key (device_id, user_id) references public.model_devices(id, user_id) on delete cascade
);
create index model_devices_user on public.model_devices(user_id);
create index model_device_jobs_queue on public.model_device_jobs(device_id, created_at) where status in ('pending','running');
create index model_device_jobs_expiry on public.model_device_jobs(expires_at);
create index model_device_pairs_user on public.model_device_pairs(user_id);
alter table public.model_device_pairs enable row level security;
alter table public.model_devices enable row level security;
alter table public.model_device_jobs enable row level security;
revoke all on public.model_device_pairs, public.model_devices, public.model_device_jobs from public, anon, authenticated;
grant all on public.model_device_pairs, public.model_devices, public.model_device_jobs to service_role;

create function public.pair_model_device(pair_hash text, device_hash text, device_name text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; device_id uuid;
begin
  update public.model_device_pairs set used_at = now()
    where token_hash = pair_hash and used_at is null and expires_at > now()
    returning user_id into owner_id;
  if owner_id is null then raise exception 'PAIR_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if (select count(*) from public.model_devices where user_id = owner_id and revoked_at is null) >= 5 then
    raise exception 'DEVICE_LIMIT';
  end if;
  insert into public.model_devices(user_id, token_hash, name, provider)
    values (owner_id, device_hash, device_name, 'gemini') returning id into device_id;
  return device_id;
end $$;

-- All queue transitions lock the device row, including revocation.
create function public.model_device_transition(device_hash text, action text, job_id uuid default null,
  lease_hash text default null, result_text text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare device public.model_devices; job public.model_device_jobs;
begin
  select * into device from public.model_devices where token_hash = device_hash for update;
  if device.id is null or device.revoked_at is not null then raise exception 'DEVICE_INVALID'; end if;
  delete from public.model_device_pairs where expires_at < now();
  delete from public.model_device_jobs where expires_at < now();
  update public.model_devices set last_seen_at = now() where id = device.id;
  if action = 'heartbeat' then
    if job_id is not null and not exists (select 1 from public.model_device_jobs where id = job_id
      and device_id = device.id and status = 'running' and claim_hash = lease_hash and expires_at > now()) then
      raise exception 'JOB_INVALID';
    end if;
    return null;
  elsif action = 'poll' then
    if exists (select 1 from public.model_device_jobs j where j.device_id = device.id and status = 'running') then return null; end if;
    select * into job from public.model_device_jobs j where j.device_id = device.id and status = 'pending'
      and expires_at > now() order by created_at limit 1 for update;
    if job.id is null then return null; end if;
    update public.model_device_jobs set status = 'running', claim_hash = lease_hash where id = job.id;
    return jsonb_build_object('id', job.id, 'prompt', job.prompt, 'expiresAt', job.expires_at);
  elsif action in ('complete','fail') then
    update public.model_device_jobs set status = case when action = 'complete' then 'completed' else 'failed' end,
      response = case when action = 'complete' then result_text else null end, prompt = '', claim_hash = null
      where id = job_id and model_device_jobs.device_id = device.id and status = 'running'
        and claim_hash = lease_hash and expires_at > now() returning * into job;
    if job.id is null then raise exception 'JOB_INVALID'; end if;
    return jsonb_build_object('accepted', true);
  end if;
  raise exception 'ACTION_INVALID';
end $$;

create function public.revoke_model_device(owner_id uuid, device_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.model_devices where id = device_id and user_id = owner_id for update;
  if not found then return false; end if;
  update public.model_devices set revoked_at = now() where id = device_id;
  delete from public.model_device_jobs where model_device_jobs.device_id = revoke_model_device.device_id;
  return true;
end $$;

create function public.enqueue_model_device_job(owner_id uuid, device_id uuid, input_text text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid;
begin
  perform 1 from public.model_devices where id = device_id and user_id = owner_id and revoked_at is null
    and last_seen_at > now() - interval '20 seconds' for update;
  if not found then raise exception 'DEVICE_OFFLINE'; end if;
  delete from public.model_device_jobs where model_device_jobs.device_id = enqueue_model_device_job.device_id and expires_at < now();
  if exists (select 1 from public.model_device_jobs where model_device_jobs.device_id = enqueue_model_device_job.device_id
    and status in ('pending','running')) then raise exception 'DEVICE_BUSY'; end if;
  insert into public.model_device_jobs(user_id, device_id, prompt) values (owner_id, device_id, input_text) returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.pair_model_device(text,text,text),
  public.model_device_transition(text,text,uuid,text,text), public.revoke_model_device(uuid,uuid),
  public.enqueue_model_device_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.pair_model_device(text,text,text),
  public.model_device_transition(text,text,uuid,text,text), public.revoke_model_device(uuid,uuid),
  public.enqueue_model_device_job(uuid,uuid,text) to service_role;
