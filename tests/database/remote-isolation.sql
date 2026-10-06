-- Synthetic users and records are rolled back, including the profile trigger.
begin;
insert into auth.users (id,email) values
  ('10000000-0000-0000-0000-000000000001', 'a@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'b@example.invalid');
insert into public.departments (id, name, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'A', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'B', '10000000-0000-0000-0000-000000000002');
insert into public.agents (id, department_id, created_by, name, provider, model) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A', 'openai', 'synthetic'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B', 'openai', 'synthetic');
insert into public.tasks (department_id, created_by, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
declare changed integer;
begin
  if (select count(*) from public.departments) <> 1
    or (select count(*) from public.agents) <> 1
    or (select count(*) from public.tasks) <> 1 then
    raise exception 'User A can read outside their department';
  end if;
  update public.agents set name = 'intrusion' where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-department update allowed'; end if;
  delete from public.agents where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-department delete allowed'; end if;
  begin
    insert into public.agents (department_id, created_by, name, provider, model)
    values ('20000000-0000-0000-0000-000000000002', auth.uid(), 'intrusion', 'openai', 'synthetic');
    raise exception 'Cross-department insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if (select count(*) from public.agents) <> 1
    or exists (select 1 from public.agents where name = 'A') then
    raise exception 'User B can read user A agent';
  end if;
  if has_table_privilege(current_user, 'public.provider_connection_secrets', 'SELECT')
    or has_table_privilege(current_user, 'public.tool_connections', 'SELECT')
    or has_table_privilege(current_user, 'public.telegram_bots', 'SELECT') then
    raise exception 'Private credentials exposed';
  end if;
  if has_function_privilege(current_user, 'public.consume_workspace_execution_quota(integer)', 'EXECUTE')
    or has_function_privilege(current_user, 'public.claim_telegram_updates(integer)', 'EXECUTE') then
    raise exception 'Privileged worker callable by browser role';
  end if;
end $$;
do $reverse$ declare affected integer; begin
update public.agents set name='intrusion' where id='30000000-0000-0000-0000-000000000001';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Reverse agent update allowed'; end if;
delete from public.agents where id='30000000-0000-0000-0000-000000000001';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Reverse agent delete allowed'; end if;
update public.tasks set title='intrusion' where department_id='20000000-0000-0000-0000-000000000001';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Reverse task update allowed'; end if;
delete from public.tasks where department_id='20000000-0000-0000-0000-000000000001';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Reverse task delete allowed'; end if;
begin
insert into public.tasks(department_id,created_by,title) values('20000000-0000-0000-0000-000000000001',auth.uid(),'intrusion');
raise exception 'Reverse task insert allowed';
exception when insufficient_privilege then null; end;
end $reverse$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $forward$ declare affected integer; begin
update public.tasks set title='intrusion' where department_id='20000000-0000-0000-0000-000000000002';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Task update allowed'; end if;
delete from public.tasks where department_id='20000000-0000-0000-0000-000000000002';
get diagnostics affected=row_count; if affected<>0 then raise exception 'Task delete allowed'; end if;
begin
insert into public.tasks(department_id,created_by,title) values('20000000-0000-0000-0000-000000000002',auth.uid(),'intrusion');
raise exception 'Task insert allowed';
exception when insufficient_privilege then null; end;
end $forward$;
reset role;
insert into auth.users (id,email) values
('10000000-0000-0000-0000-000000000013','admin1@example.invalid'),
('10000000-0000-0000-0000-000000000014','admin2@example.invalid'),
('10000000-0000-0000-0000-000000000015','admin3@example.invalid');
update public.profiles set role='admin' where id in ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000015');
set local role authenticated;
do $admins$ declare identity_id uuid; affected integer; begin
foreach identity_id in array array['10000000-0000-0000-0000-000000000013'::uuid,'10000000-0000-0000-0000-000000000014'::uuid,'10000000-0000-0000-0000-000000000015'::uuid] loop
perform set_config('request.jwt.claim.sub',identity_id::text,true);
if not public.is_workspace_admin() or (select count(*) from public.agents where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'))<>2 then raise exception 'Synthetic admin global read failed'; end if;
update public.agents set description='synthetic admin test' where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
get diagnostics affected=row_count; if affected<>2 then raise exception 'Synthetic admin global write failed'; end if;
end loop; end $admins$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  if (select count(*) from public.agents) <> 2 then
    raise exception 'Administrator cannot read all departments';
  end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if has_table_privilege(current_user, 'public.provider_connection_secrets', 'SELECT')
    or has_table_privilege(current_user, 'public.tool_connections', 'SELECT')
    or has_table_privilege(current_user, 'public.telegram_bots', 'SELECT') then
    raise exception 'Private credentials exposed to anonymous clients';
  end if;
end $$;
reset role;
rollback;


