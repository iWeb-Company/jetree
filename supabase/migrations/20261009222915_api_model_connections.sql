-- Preserve existing credentials and allow multiple API keys per provider/user.
alter type public.provider_name add value if not exists 'deepseek';
alter table public.provider_connections drop constraint if exists provider_connections_user_id_provider_key;
create index provider_connections_owner_provider_idx on public.provider_connections(user_id, provider);

-- Keep the oldest existing connection as the explicit default.
with defaults as (
  select distinct on (user_id, provider) id from public.provider_connections
  where connection_type = 'api_key' order by user_id, provider, connected_at, id
)
update public.provider_connections c set metadata = c.metadata || jsonb_build_object('is_default', true)
from defaults d where c.id = d.id;
create unique index provider_connections_one_default on public.provider_connections(user_id,provider)
  where metadata->>'is_default' = 'true';

-- Atomic metadata + encrypted secret insert. Only server service_role can call.
create function public.save_provider_api_connection(owner_id uuid, detected_provider public.provider_name, encrypted_value text, encrypted_iv text, encrypted_tag text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare connection_id uuid; first_key boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || detected_provider::text, 0));
  first_key := not exists(select 1 from public.provider_connections where user_id = owner_id and provider = detected_provider);
  insert into public.provider_connections(user_id,provider,connection_type,status,metadata,connected_at,last_checked_at)
  values(owner_id,detected_provider,'api_key','connected',jsonb_build_object('is_default',first_key),now(),now())
  returning id into connection_id;
  insert into public.provider_connection_secrets(connection_id,ciphertext,iv,auth_tag)
  values(connection_id,encrypted_value,encrypted_iv,encrypted_tag);
  insert into public.provider_connection_audit(user_id,provider,action) values(owner_id,detected_provider,'saved');
  return connection_id;
end;
$$;

create function public.select_provider_api_connection(owner_id uuid, selected_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare selected_provider public.provider_name;
begin
  select provider into selected_provider from public.provider_connections where id=selected_id and user_id=owner_id;
  if selected_provider is null then raise exception 'CONNECTION_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || selected_provider::text, 0));
  perform 1 from public.provider_connections where id=selected_id and user_id=owner_id and status='connected' and connection_type='api_key' for update;
  if not found then raise exception 'CONNECTION_NOT_AVAILABLE'; end if;
  update public.provider_connections set metadata=metadata || jsonb_build_object('is_default',false)
    where user_id=owner_id and provider=selected_provider and metadata->>'is_default'='true';
  update public.provider_connections set metadata=metadata || jsonb_build_object('is_default',true)
    where id=selected_id and user_id=owner_id;
end;
$$;
revoke execute on function public.save_provider_api_connection(uuid,public.provider_name,text,text,text), public.select_provider_api_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_provider_api_connection(uuid,public.provider_name,text,text,text), public.select_provider_api_connection(uuid,uuid) to service_role;
