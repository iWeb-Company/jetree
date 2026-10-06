begin;
do $$
begin
  if (select count(*) from public.profiles) <> 5
    or (select count(*) from public.profiles where role='admin') <> 3
    or (select count(*) from public.departments) <> 2
    or (select count(*) from public.department_members) <> 2
    or (select count(*) from public.agents) <> 2
    or (select count(*) from public.tasks) <> 2 then
    raise exception 'Migration changed synthetic business row counts';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000011',true);
do $$
declare affected integer;
begin
  if (select count(*) from public.agents) <> 1 or (select count(*) from public.tasks) <> 1 then
    raise exception 'Seed user A isolation failed';
  end if;
  update public.tasks set title='intrusion' where assigned_agent_id='30000000-0000-0000-0000-000000000012';
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Cross-department task update allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000012',true);
do $$
declare affected integer;
begin
  if (select count(*) from public.agents) <> 1 or (select count(*) from public.tasks) <> 1 then
    raise exception 'Seed user B isolation failed';
  end if;
  update public.agents set name='intrusion' where id='30000000-0000-0000-0000-000000000011';
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Reverse cross-department agent update allowed'; end if;
end $$;
do $$
declare identity_id uuid;
begin
  foreach identity_id in array array[
    '10000000-0000-0000-0000-000000000013'::uuid,
    '10000000-0000-0000-0000-000000000014'::uuid,
    '10000000-0000-0000-0000-000000000015'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub',identity_id::text,true);
    if not public.is_workspace_admin() or (select count(*) from public.agents) <> 2
      or (select count(*) from public.departments) <> 2 then
      raise exception 'Synthetic administrator lost global access';
    end if;
    update public.agents set description='admin test';
  end loop;
end $$;
reset role;
rollback;
