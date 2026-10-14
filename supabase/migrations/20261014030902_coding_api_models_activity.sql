alter table public.coding_projects add column jetree_models_enabled boolean not null default false;
alter table public.coding_sessions drop constraint coding_sessions_provider_check;
alter table public.coding_sessions add constraint coding_sessions_provider_check check(provider in ('groq','openrouter','deepseek','openai','gemini','claude'));
alter table public.coding_sessions add column model_source text not null default 'local' check(model_source in ('local','jetree'));
alter table public.coding_sessions add column connection_id uuid references public.provider_connections(id) on delete set null;
create index coding_session_connection_idx on public.coding_sessions(connection_id);
alter table public.coding_sessions add column inference_calls integer not null default 0;
alter table public.coding_sessions add column inference_ticket uuid;
alter table public.coding_sessions add column inference_until timestamptz;
alter table public.coding_sessions add column activity_bytes integer not null default 0;
alter table public.coding_sessions add constraint coding_session_activity_owner unique(id,user_id,executor_id);
create table public.coding_activity (
  session_id uuid not null, user_id uuid not null, executor_id uuid not null,
  sequence integer not null check(sequence between 1 and 500),
  event jsonb not null check(octet_length(event::text)<=7000),
  created_at timestamptz not null default now(), primary key(session_id,sequence),
  foreign key(session_id,user_id,executor_id) references public.coding_sessions(id,user_id,executor_id) on delete cascade
);
create index coding_activity_owner_idx on public.coding_activity(user_id,session_id);
create index coding_activity_executor_idx on public.coding_activity(executor_id);
alter table public.coding_activity enable row level security;
revoke all on public.coding_activity from public,anon,authenticated;
grant all on public.coding_activity to service_role;
create function public.reserve_coding_inference(p_job uuid,p_claim uuid,p_ticket uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.coding_sessions s set inference_calls=inference_calls+1,inference_ticket=p_ticket,inference_until=now()+interval '125 seconds'
  where s.id=p_job and s.claim_id=p_claim and s.model_source='jetree' and s.status in ('preparing','running') and not s.cancel_requested and s.lease_until>now()
    and s.inference_calls<40 and (s.inference_until is null or s.inference_until<now())
    and exists(select 1 from public.coding_executors e where e.id=s.executor_id and e.user_id=s.user_id and e.revoked_at is null and e.expires_at>now())
    and exists(select 1 from public.provider_connections c where c.id=s.connection_id and c.user_id=s.user_id and c.connection_type='api_key' and c.status in ('configured','connected'));
  return found;
end $$;
create function public.append_coding_activity(p_executor uuid,p_user uuid,p_job uuid,p_claim uuid,p_events jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j public.coding_sessions; item jsonb; added integer:=0;
begin
  if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>20 then return false; end if;
  select * into j from public.coding_sessions where id=p_job and user_id=p_user and executor_id=p_executor and claim_id=p_claim for update;
  if not found or j.status not in ('preparing','running','verifying') or j.lease_until<now() then return false; end if;
  if not exists(select 1 from public.coding_executors where id=p_executor and user_id=p_user and revoked_at is null and expires_at>now()) then return false; end if;
  -- Validate the whole batch before inserting: rejection must not leave rows
  -- outside the byte counter. Replayed sequence numbers consume no budget.
  for item in select value from jsonb_array_elements(p_events) loop
    if octet_length(item::text)>7000 or (item->>'sequence')::integer not between 1 and 500 then raise exception 'Invalid activity'; end if;
    if not exists(select 1 from public.coding_activity where session_id=p_job and sequence=(item->>'sequence')::integer) then added:=added+octet_length(item::text); end if;
  end loop;
  if j.activity_bytes+added>1048576 then return false; end if;
  added:=0;
  for item in select value from jsonb_array_elements(p_events) loop
    if octet_length(item::text)>7000 or (item->>'sequence')::integer not between 1 and 500 then raise exception 'Invalid activity'; end if;
    insert into public.coding_activity values(p_job,p_user,p_executor,(item->>'sequence')::integer,item,now()) on conflict do nothing;
    if found then added:=added+octet_length(item::text); end if;
  end loop;
  update public.coding_sessions set activity_bytes=activity_bytes+added where id=p_job;
  return true;
end $$;
revoke all on function public.reserve_coding_inference(uuid,uuid,uuid),public.append_coding_activity(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_coding_inference(uuid,uuid,uuid),public.append_coding_activity(uuid,uuid,uuid,uuid,jsonb) to service_role;
