-- Opaque credentials bound to Jetree MCP, never Claude credentials or Supabase JWTs.
create table public.mcp_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  redirect_uri text not null,
  resource_uri text not null,
  scopes text[] not null check (scopes <@ array['jetree:read','jetree:request-write'] and scopes @> array['jetree:read']),
  agent_ids uuid[] not null check (cardinality(agent_ids) between 1 and 100),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create table public.mcp_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_hash text not null unique check (access_hash ~ '^[a-f0-9]{64}$'),
  refresh_hash text not null unique check (refresh_hash ~ '^[a-f0-9]{64}$'),
  resource_uri text not null,
  scopes text[] not null check (scopes <@ array['jetree:read','jetree:request-write'] and scopes @> array['jetree:read']),
  agent_ids uuid[] not null check (cardinality(agent_ids) between 1 and 100),
  access_expires_at timestamptz not null default now() + interval '1 hour',
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_grants_owner_idx on public.mcp_grants(user_id);
alter table public.mcp_codes enable row level security;
alter table public.mcp_grants enable row level security;
revoke all on public.mcp_codes, public.mcp_grants from public, anon, authenticated;
grant all on public.mcp_codes, public.mcp_grants to service_role;

create function public.mcp_issue_code(owner_id uuid, code_hash text, code_challenge text, redirect_uri text, resource_uri text, granted_scopes text[], permitted_agents uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1929));
  delete from public.mcp_codes where expires_at <= now();
  delete from public.mcp_grants where expires_at <= now();
  if (select count(*) from public.mcp_grants where user_id = owner_id and revoked_at is null) >= 5 then raise exception 'MCP_GRANT_LIMIT'; end if;
  if (select count(*) from public.mcp_codes where user_id = owner_id) >= 5 then raise exception 'MCP_CODE_LIMIT'; end if;
  insert into public.mcp_codes(code_hash,user_id,challenge,redirect_uri,resource_uri,scopes,agent_ids)
  values (code_hash,owner_id,code_challenge,redirect_uri,resource_uri,granted_scopes,permitted_agents);
end;
$$;
create function public.mcp_exchange_code(code_hash text, verifier_challenge text, redirect_uri text, resource_uri text, new_access_hash text, new_refresh_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare code public.mcp_codes; grant_id uuid;
begin
  select * into code from public.mcp_codes c where c.code_hash = mcp_exchange_code.code_hash for update;
  if not found or code.expires_at <= now() or code.challenge <> verifier_challenge or code.redirect_uri <> redirect_uri or code.resource_uri <> resource_uri then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(code.user_id::text, 1929));
  if (select count(*) from public.mcp_grants g where g.user_id = code.user_id and g.revoked_at is null and g.expires_at > now()) >= 5 then return null; end if;
  delete from public.mcp_codes c where c.code_hash = code.code_hash;
  insert into public.mcp_grants(user_id,access_hash,refresh_hash,resource_uri,scopes,agent_ids)
    values(code.user_id,new_access_hash,new_refresh_hash,code.resource_uri,code.scopes,code.agent_ids) returning id into grant_id;
  return jsonb_build_object('id',grant_id,'scopes',code.scopes);
end;
$$;
create function public.mcp_refresh_grant(old_refresh_hash text, resource_uri text, new_access_hash text, new_refresh_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare updated public.mcp_grants;
begin
  -- UPDATE locks the row: one refresh succeeds; stale tokens cannot race or replay.
  update public.mcp_grants g set access_hash = new_access_hash, refresh_hash = new_refresh_hash, access_expires_at = least(now() + interval '1 hour', g.expires_at)
    where g.refresh_hash = old_refresh_hash and g.resource_uri = mcp_refresh_grant.resource_uri and g.revoked_at is null and g.expires_at > now()
    returning g.* into updated;
  if not found then return null; end if;
  return jsonb_build_object('id',updated.id,'scopes',updated.scopes);
end;
$$;
create function public.mcp_grant_context(access_hash text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare g public.mcp_grants; permitted jsonb;
begin
  select * into g from public.mcp_grants where mcp_grants.access_hash = mcp_grant_context.access_hash and revoked_at is null and access_expires_at > now() and expires_at > now();
  if not found then return null; end if;
  -- Mirrors agents_visible / can_use_department, narrowed to explicitly selected
  -- nonarchived agents. Privileges are rechecked on every MCP request.
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'description',a.description,'enabled_tool_ids',a.enabled_tool_ids)), '[]'::jsonb)
    into permitted from public.agents a join public.departments d on d.id = a.department_id
    where a.id = any(g.agent_ids) and a.deleted_at is null and d.deleted_at is null and (
      exists(select 1 from public.profiles p where p.id = g.user_id and p.role = 'admin')
      or a.created_by = g.user_id
      or d.created_by = g.user_id
      or exists(select 1 from public.department_members m where m.department_id = a.department_id and m.user_id = g.user_id)
    );
  return jsonb_build_object('grantId',g.id,'userId',g.user_id,'scopes',g.scopes,'agents',permitted);
end;
$$;
revoke execute on function public.mcp_issue_code(uuid,text,text,text,text,text[],uuid[]), public.mcp_exchange_code(text,text,text,text,text,text), public.mcp_refresh_grant(text,text,text,text), public.mcp_grant_context(text) from public, anon, authenticated;
grant execute on function public.mcp_issue_code(uuid,text,text,text,text,text[],uuid[]), public.mcp_exchange_code(text,text,text,text,text,text), public.mcp_refresh_grant(text,text,text,text), public.mcp_grant_context(text) to service_role;
