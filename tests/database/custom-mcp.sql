begin;
insert into auth.users(id,email) values ('91000000-0000-0000-0000-000000000001','mcp-owner@example.invalid'),('91000000-0000-0000-0000-000000000002','mcp-other@example.invalid');
insert into public.custom_mcp_connections(id,user_id,name,url,auth_mode,ciphertext,iv,auth_tag) values ('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Docs','https://docs.example.invalid/mcp','none','encrypted','iv','tag');
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated'] loop
  foreach t in array array['custom_mcp_connections','custom_mcp_agent_access','custom_mcp_oauth_states'] loop
   if has_table_privilege(r,'public.'||t,'select,insert,update,delete') then raise exception 'Direct MCP access: % %',r,t;end if;
   if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'MCP RLS missing';end if;
  end loop;
 end loop;
 begin
  insert into public.custom_mcp_oauth_states values ('foreign','92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002',1,now()+interval '10 minutes');
  raise exception 'Foreign OAuth owner accepted';
 exception when foreign_key_violation then null;end;
end $$;
set local role service_role;
do $$ begin
 if public.lock_custom_mcp_connection('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002',gen_random_uuid()) then raise exception 'Foreign connection claimed';end if;
 if not public.lock_custom_mcp_connection('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',gen_random_uuid()) then raise exception 'Owner lease failed';end if;
 if public.lock_custom_mcp_connection('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',gen_random_uuid()) then raise exception 'Concurrent lease accepted';end if;
 update public.custom_mcp_connections set lock_until=now()-interval '1 second';
 if not public.lock_custom_mcp_connection('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',gen_random_uuid()) then raise exception 'Expired lease not recovered';end if;
 update public.custom_mcp_connections set status='revoked',lock_until=null;
 if public.lock_custom_mcp_connection('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',gen_random_uuid()) then raise exception 'Revoked connection claimed';end if;
 insert into public.custom_mcp_oauth_states values ('single-use','92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',1,now()+interval '10 minutes');
 delete from public.custom_mcp_oauth_states where state_hash='single-use' and expires_at>now();
 if not found then raise exception 'OAuth state missing';end if;
 delete from public.custom_mcp_oauth_states where state_hash='single-use' and expires_at>now();
 if found then raise exception 'OAuth replay accepted';end if;
end $$;
rollback;
