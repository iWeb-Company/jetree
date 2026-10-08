-- Disposable CI database only. No real identities, grants or provider credentials.
begin;
insert into auth.users(id,email) values ('40000000-0000-0000-0000-000000000001','mcp1@example.test'),('40000000-0000-0000-0000-000000000002','mcp2@example.test');
insert into public.departments(id,name,created_by) values ('41000000-0000-0000-0000-000000000001','MCP A','40000000-0000-0000-0000-000000000001'),('41000000-0000-0000-0000-000000000002','MCP B','40000000-0000-0000-0000-000000000002');
insert into public.agents(id,department_id,created_by,name,provider,model) values
 ('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','MCP A','gemini','synthetic'),
 ('42000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','MCP B','gemini','synthetic');
set local role service_role;
do $$
declare result jsonb; gid uuid;
begin
 perform public.mcp_issue_code('40000000-0000-0000-0000-000000000001',repeat('a',64),repeat('b',43),'https://claude.ai/api/mcp/auth_callback','https://dev.example.test/mcp',array['jetree:read'],array['42000000-0000-0000-0000-000000000001'::uuid,'42000000-0000-0000-0000-000000000002'::uuid]);
 if public.mcp_exchange_code(repeat('a',64),repeat('x',43),'https://claude.ai/api/mcp/auth_callback','https://dev.example.test/mcp',repeat('c',64),repeat('d',64)) is not null then raise exception 'Wrong PKCE accepted'; end if;
 if public.mcp_exchange_code(repeat('a',64),repeat('b',43),'https://evil.example.test/','https://dev.example.test/mcp',repeat('c',64),repeat('d',64)) is not null then raise exception 'Wrong redirect accepted'; end if;
 if public.mcp_exchange_code(repeat('a',64),repeat('b',43),'https://claude.ai/api/mcp/auth_callback','https://prod.example.test/mcp',repeat('c',64),repeat('d',64)) is not null then raise exception 'Wrong resource accepted'; end if;
 result := public.mcp_exchange_code(repeat('a',64),repeat('b',43),'https://claude.ai/api/mcp/auth_callback','https://dev.example.test/mcp',repeat('c',64),repeat('d',64));
 if result is null then raise exception 'Valid code rejected'; end if; gid := (result->>'id')::uuid;
 if public.mcp_exchange_code(repeat('a',64),repeat('b',43),'https://claude.ai/api/mcp/auth_callback','https://dev.example.test/mcp',repeat('e',64),repeat('f',64)) is not null then raise exception 'Code replay'; end if;
 result := public.mcp_grant_context(repeat('c',64));
 if jsonb_array_length(result->'agents') <> 1 or result->'agents'->0->>'name' <> 'MCP A' then raise exception 'Another user agent leaked'; end if;
 if result->'scopes' @> '["jetree:request-write"]'::jsonb then raise exception 'Scope escalation'; end if;
 -- Membership loss is applied live, even for an unexpired access token.
 insert into public.department_members values('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',now());
 if jsonb_array_length(public.mcp_grant_context(repeat('c',64))->'agents') <> 2 then raise exception 'Membership not respected'; end if;
 delete from public.department_members where department_id='41000000-0000-0000-0000-000000000002' and user_id='40000000-0000-0000-0000-000000000001';
 if jsonb_array_length(public.mcp_grant_context(repeat('c',64))->'agents') <> 1 then raise exception 'Removed membership retained'; end if;
 if public.mcp_refresh_grant(repeat('d',64),'https://prod.example.test/mcp',repeat('e',64),repeat('f',64)) is not null then raise exception 'Refresh audience bypass'; end if;
 if public.mcp_refresh_grant(repeat('d',64),'https://dev.example.test/mcp',repeat('e',64),repeat('f',64)) is null then raise exception 'Refresh failed'; end if;
 if public.mcp_grant_context(repeat('c',64)) is not null then raise exception 'Old access token retained'; end if;
 if public.mcp_refresh_grant(repeat('d',64),'https://dev.example.test/mcp',repeat('a',64),repeat('b',64)) is not null then raise exception 'Refresh replay'; end if;
 update public.mcp_grants set revoked_at=now() where id=gid;
 if public.mcp_grant_context(repeat('e',64)) is not null or public.mcp_refresh_grant(repeat('f',64),'https://dev.example.test/mcp',repeat('a',64),repeat('b',64)) is not null then raise exception 'Revocation bypass'; end if;
 if has_table_privilege('authenticated','public.mcp_grants','SELECT') or has_table_privilege('anon','public.mcp_codes','SELECT') or has_function_privilege('authenticated','public.mcp_grant_context(text)','EXECUTE') then raise exception 'MCP credentials exposed'; end if;
end $$;
rollback;
