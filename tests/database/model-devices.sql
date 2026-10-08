-- Run only on the disposable CI database with synthetic users.
begin;
insert into auth.users(id,email) values ('30000000-0000-0000-0000-000000000001','device1@example.test'),
  ('30000000-0000-0000-0000-000000000002','device2@example.test');
insert into public.model_device_pairs(token_hash,user_id,expires_at) values
  (repeat('a',64),'30000000-0000-0000-0000-000000000001',now()+interval '5 minutes');
select public.pair_model_device(repeat('a',64),repeat('b',64),'Synthetic device');
set local role service_role;
do $$
declare d uuid; j uuid; claimed jsonb; failed boolean := false;
begin
  select id into d from public.model_devices where token_hash=repeat('b',64);
  begin perform public.pair_model_device(repeat('a',64),repeat('c',64),'Replay');
  exception when others then failed := true; end;
  if not failed then raise exception 'Pairing token reused'; end if;
  perform public.model_device_transition(repeat('b',64),'poll',null,repeat('d',64),null);
  failed := false;
  begin perform public.enqueue_model_device_job('30000000-0000-0000-0000-000000000002',d,'Unauthorized');
  exception when others then failed := true; end;
  if not failed then raise exception 'Another user queued work'; end if;
  j := public.enqueue_model_device_job('30000000-0000-0000-0000-000000000001',d,'Own prompt');
  claimed := public.model_device_transition(repeat('b',64),'poll',null,repeat('d',64),null);
  if claimed->>'id' <> j::text then raise exception 'Wrong job claimed'; end if;
  if public.model_device_transition(repeat('b',64),'poll',null,repeat('e',64),null) is not null then raise exception 'Job claimed twice'; end if;
  failed := false;
  begin perform public.model_device_transition(repeat('b',64),'complete',j,repeat('e',64),'Forged reply');
  exception when others then failed := true; end;
  if not failed then raise exception 'Wrong lease accepted'; end if;
  perform public.model_device_transition(repeat('b',64),'complete',j,repeat('d',64),'Correct reply');
  if (select response from public.model_device_jobs where id=j) <> 'Correct reply' then raise exception 'Response missing'; end if;
  if public.revoke_model_device('30000000-0000-0000-0000-000000000002',d) then raise exception 'Cross-user revocation'; end if;
  perform public.revoke_model_device('30000000-0000-0000-0000-000000000001',d);
  if exists(select 1 from public.model_device_jobs where device_id=d) then raise exception 'Revocation retained jobs'; end if;
  failed := false;
  begin perform public.model_device_transition(repeat('b',64),'poll',null,repeat('e',64),null);
  exception when others then failed := true; end;
  if not failed then raise exception 'Revoked device accepted'; end if;
  if has_table_privilege('authenticated','public.model_devices','SELECT') or has_table_privilege('anon','public.model_device_jobs','SELECT')
    or has_function_privilege('authenticated','public.pair_model_device(text,text,text)','EXECUTE') then raise exception 'Public relay access'; end if;
end $$;
rollback;
