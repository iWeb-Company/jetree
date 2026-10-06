-- Adoption path for the audited Jetree database only; not a fresh install.
-- Run with apply_migration after a verified backup. No data is rewritten.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $baseline$
declare observed record;
begin
select
md5((select string_agg(table_name||':'||column_name||':'||ordinal_position||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''), E'\n' order by table_name,ordinal_position) from information_schema.columns where table_schema='public')) as columns_hash,
md5((select string_agg(c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid)||':'||c.convalidated, E'\n' order by c.conrelid::regclass::text,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')) as constraints_hash,
md5((select string_agg(tablename||':'||indexname||':'||indexdef,E'\n' order by tablename,indexname) from pg_indexes where schemaname='public')) as indexes_hash,
md5((select string_agg(tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'')||':'||roles::text,E'\n' order by tablename,policyname) from pg_policies where schemaname='public')) as policies_hash,
md5((select string_agg(t.typname||':'||e.enumlabel||':'||e.enumsortorder, E'\n' order by t.typname,e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public')) as enums_hash,
md5((select string_agg(p.proname||':'||regexp_replace(pg_get_functiondef(p.oid),'\s+','','g'),E'\n' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e'))) as functions_hash,
md5((select string_agg(n.nspname||':'||c.relname||':'||t.tgname||':'||pg_get_triggerdef(t.oid)||':'||t.tgenabled::text,E'\n' order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and t.tgname='on_auth_user_created')))) as triggers_hash,
md5((select string_agg(table_name||':'||grantee||':'||privilege_type||':'||is_grantable,E'\n' order by table_name,grantee,privilege_type) from information_schema.role_table_grants where table_schema='public')) as grants_hash into observed;
  if observed.columns_hash is distinct from '50b40bf0061f53750a126a562c9968f5' then raise exception 'BASELINE_DRIFT: columns_hash'; end if;
  if observed.constraints_hash is distinct from 'd44911abcaafc255a7089646a47cac00' then raise exception 'BASELINE_DRIFT: constraints_hash'; end if;
  if observed.indexes_hash is distinct from '7d0b0b4ba8aa05233574bc9f6975130c' then raise exception 'BASELINE_DRIFT: indexes_hash'; end if;
  if observed.policies_hash is distinct from 'e76507ad64f0d94a185cf1e5b3993e2a' then raise exception 'BASELINE_DRIFT: policies_hash'; end if;
  if observed.enums_hash is distinct from 'a9cdb4ab5386f85ef4438d6fc0d55ec6' then raise exception 'BASELINE_DRIFT: enums_hash'; end if;
  if observed.functions_hash is distinct from 'dbf2a5d1f8c49806143903d168c14f28' then raise exception 'BASELINE_DRIFT: functions_hash'; end if;
  if observed.triggers_hash is distinct from '0c3202a11dd53ce06dbc04e02f4000b9' then raise exception 'BASELINE_DRIFT: triggers_hash'; end if;
  if observed.grants_hash is distinct from 'e60326f50ffd2f885d48276c6bce0c76' then raise exception 'BASELINE_DRIFT: grants_hash'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) <> 7 then
    raise exception 'BASELINE_DRIFT: expected seven RLS tables';
  end if;
end;
$baseline$;

-- Normalize the one policy-name drift; expression and ownership remain intact.
alter policy departments_write on public.departments rename to departments_admin_write;

-- Close the known membership leak immediately during baseline adoption.
drop policy agents_visible on public.agents;
create policy agents_visible on public.agents for select using (
  public.is_workspace_admin() or created_by = auth.uid() or exists (
    select 1 from public.department_members m
    where m.department_id = public.agents.department_id and m.user_id = auth.uid()
  )
);
drop policy tasks_visible on public.tasks;
create policy tasks_visible on public.tasks for select using (
  public.is_workspace_admin() or created_by = auth.uid() or exists (
    select 1 from public.department_members m
    where m.department_id = public.tasks.department_id and m.user_id = auth.uid()
  )
);
