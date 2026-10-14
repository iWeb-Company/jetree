begin;
insert into auth.users(id,email) values ('81000000-0000-0000-0000-000000000001','coding-owner@example.invalid'),('81000000-0000-0000-0000-000000000002','coding-other@example.invalid');
insert into public.coding_executors(id,user_id,name,token_hash,expires_at) values ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Local',repeat('a',64),now()+interval '1 day');
insert into public.coding_projects(id,user_id,executor_id,local_id,name,models,test_command) values ('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','demo','Demo','[{"provider":"groq","model":"fixed"}]','node --test');
insert into public.coding_sessions(id,user_id,executor_id,project_id,request_id,prompt,provider,model) values
 ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001','Fix','groq','fixed'),
 ('84000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000002','Second','groq','fixed');
do $$ declare role_name text;t text;begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach t in array array['coding_pair_codes','coding_executors','coding_projects','coding_sessions','coding_activity'] loop
   if has_table_privilege(role_name,'public.'||t,'select,insert,update,delete') then raise exception 'Direct coding access: % %',role_name,t;end if;
   if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS missing';end if;
  end loop;
 end loop;
 begin
  insert into public.coding_sessions(user_id,executor_id,project_id,request_id,prompt,provider,model) values('81000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001',gen_random_uuid(),'Foreign','groq','fixed');
  raise exception 'Foreign project owner accepted';
 exception when foreign_key_violation then null;end;
end $$;
set local role service_role;
do $$ declare j public.coding_sessions; r public.coding_sessions;begin
 if exists(select 1 from public.claim_coding_session('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002')) then raise exception 'Foreign user claimed';end if;
 select * into j from public.claim_coding_session('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001');
 if j.status<>'preparing' or j.claim_id is null then raise exception 'Claim failed';end if;
 if public.append_coding_activity(j.executor_id,j.user_id,j.id,gen_random_uuid(),'[{"sequence":1}]') then raise exception 'Foreign claim activity accepted';end if;
 if not public.append_coding_activity(j.executor_id,j.user_id,j.id,j.claim_id,'[{"sequence":1,"kind":"tool","label":"read","status":"completed"}]') then raise exception 'Activity missing';end if;
 perform public.append_coding_activity(j.executor_id,j.user_id,j.id,j.claim_id,'[{"sequence":1,"kind":"tool","label":"read","status":"completed"}]');
 if (select count(*) from public.coding_activity where session_id=j.id)<>1 then raise exception 'Replayed log duplicated';end if;
 if (select activity_bytes from public.coding_sessions where id=j.id)<>(select octet_length(event::text) from public.coding_activity where session_id=j.id) then raise exception 'Activity byte accounting mismatch';end if;
 update public.coding_sessions set activity_bytes=1048576 where id=j.id;
 if public.append_coding_activity(j.executor_id,j.user_id,j.id,j.claim_id,'[{"sequence":2}]') then raise exception 'Unbounded activity';end if;
 if exists(select 1 from public.coding_activity where session_id=j.id and sequence=2) then raise exception 'Rejected batch partially saved';end if;
 insert into public.provider_connections(id,user_id,provider,connection_type,status) values('86000000-0000-4000-8000-000000000001',j.user_id,'groq','api_key','connected');
 update public.coding_sessions set model_source='jetree',connection_id='86000000-0000-4000-8000-000000000001' where id=j.id;
 if public.reserve_coding_inference(j.id,gen_random_uuid(),gen_random_uuid()) then raise exception 'Foreign inference claim';end if;
 if not public.reserve_coding_inference(j.id,j.claim_id,gen_random_uuid()) then raise exception 'Inference denied';end if;
 if public.reserve_coding_inference(j.id,j.claim_id,gen_random_uuid()) then raise exception 'Concurrent inference accepted';end if;
 update public.coding_sessions set inference_until=null,inference_calls=40 where id=j.id;
 if public.reserve_coding_inference(j.id,j.claim_id,gen_random_uuid()) then raise exception 'Inference budget exceeded';end if;
 update public.coding_sessions set inference_calls=0,cancel_requested=true where id=j.id;
 if public.reserve_coding_inference(j.id,j.claim_id,gen_random_uuid()) then raise exception 'Cancelled inference accepted';end if;
 update public.coding_sessions set cancel_requested=false where id=j.id;
 update public.provider_connections set user_id='81000000-0000-0000-0000-000000000002' where id='86000000-0000-4000-8000-000000000001';
 if public.reserve_coding_inference(j.id,j.claim_id,gen_random_uuid()) then raise exception 'Foreign API connection accepted';end if;
 if exists(select 1 from public.claim_coding_session(j.executor_id,j.user_id)) then raise exception 'Duplicate simultaneous claim';end if;
 if exists(select 1 from public.touch_coding_session(j.executor_id,j.user_id,j.id,gen_random_uuid(),1,'running')) then raise exception 'Wrong claim advanced';end if;
 select * into r from public.touch_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,2,'verifying');
 select * into r from public.touch_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,1,'running');
 if r.status<>'verifying' or r.sequence<>2 then raise exception 'Stale progress rewound';end if;
 if not public.finish_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,'ready_for_review','{"first":true}',null) then raise exception 'Finish failed';end if;
 perform public.finish_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,'failed','{"replayed":true}',null);
 if (select status<>'ready_for_review' or report<>'{"first":true}'::jsonb from public.coding_sessions where id=j.id) then raise exception 'Duplicate changed result';end if;
 select * into j from public.claim_coding_session(j.executor_id,j.user_id);
 update public.coding_sessions set lease_until=now()-interval '1 second' where id=j.id;
 perform public.claim_coding_session(j.executor_id,j.user_id);
 if (select status from public.coding_sessions where id=j.id)<>'interrupted' then raise exception 'Expired task replayed';end if;
 if not public.finish_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,'ready_for_review','{}',null) then raise exception 'Late result reconciliation failed';end if;
 update public.coding_executors set revoked_at=now() where id=j.executor_id;
 if exists(select 1 from public.claim_coding_session(j.executor_id,j.user_id)) then raise exception 'Revoked executor claimed';end if;
 if public.finish_coding_session(j.executor_id,j.user_id,j.id,j.claim_id,'failed','{}',null) then raise exception 'Revoked executor wrote';end if;
end $$;
reset role;
rollback;
