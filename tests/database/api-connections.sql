-- Disposable database only. Every fixture is rolled back.
begin;
insert into auth.users(id,email) values
  ('50000000-0000-0000-0000-000000000001','api1@example.test'),
  ('50000000-0000-0000-0000-000000000002','api2@example.test');
set local role service_role;
do $$
declare first_id uuid; second_id uuid; other_id uuid; failed boolean := false;
begin
  first_id := public.save_provider_api_connection('50000000-0000-0000-0000-000000000001','gemini','synthetic-ciphertext','iv','tag');
  second_id := public.save_provider_api_connection('50000000-0000-0000-0000-000000000001','gemini','another-ciphertext','iv','tag');
  other_id := public.save_provider_api_connection('50000000-0000-0000-0000-000000000002','deepseek','other-ciphertext','iv','tag');
  if (select count(*) from public.provider_connections where user_id='50000000-0000-0000-0000-000000000001') <> 2 then raise exception 'Multiple keys not retained'; end if;
  if (select metadata->>'is_default' from public.provider_connections where id=first_id) <> 'true' then raise exception 'First key not selected'; end if;
  perform public.select_provider_api_connection('50000000-0000-0000-0000-000000000001',second_id);
  if (select count(*) from public.provider_connections where user_id='50000000-0000-0000-0000-000000000001' and metadata->>'is_default'='true') <> 1 then raise exception 'Multiple defaults'; end if;
  if (select metadata->>'is_default' from public.provider_connections where id=second_id) <> 'true' then raise exception 'Selection failed'; end if;
  begin perform public.select_provider_api_connection('50000000-0000-0000-0000-000000000001',other_id);
  exception when others then failed := true; end;
  if not failed then raise exception 'Cross-user selection allowed'; end if;
  failed := false;
  begin perform public.save_provider_api_connection('50000000-0000-0000-0000-000000000001','claude',null,'iv','tag');
  exception when others then failed := true; end;
  if not failed or exists(select 1 from public.provider_connections where user_id='50000000-0000-0000-0000-000000000001' and provider='claude') then raise exception 'Failed secret save retained metadata'; end if;
  delete from public.provider_connections where id=first_id;
  if exists(select 1 from public.provider_connection_secrets where connection_id=first_id) then raise exception 'Deletion retained secret'; end if;
  if not exists(select 1 from public.provider_connection_secrets where connection_id=second_id) then raise exception 'Deletion removed another secret'; end if;
  if has_function_privilege('authenticated','public.save_provider_api_connection(uuid,public.provider_name,text,text,text)','execute') or has_function_privilege('anon','public.select_provider_api_connection(uuid,uuid)','execute') then raise exception 'Client can write vault'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$
begin
  if exists(select id from public.provider_connections where user_id='50000000-0000-0000-0000-000000000002') then raise exception 'Cross-user metadata visible'; end if;
end $$;
rollback;
