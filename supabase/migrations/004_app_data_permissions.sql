-- Backfill profiles for accounts that existed before the signup trigger.
insert into public.profiles (id, email, role)
select
  u.id,
  lower(coalesce(u.email, '')),
  case when lower(coalesce(u.email, '')) in (
    'facundod@iwebtecnology.com',
    'valentind@iwebtecnology.com',
    'tomasb@iwebtecnology.com'
  ) then 'admin'::public.workspace_role else 'member'::public.workspace_role end
from auth.users u
where u.email is not null
on conflict (id) do update set
  email = excluded.email,
  role = case when excluded.role = 'admin' then 'admin'::public.workspace_role else public.profiles.role end;

alter table public.departments add column if not exists deleted_at timestamptz;
alter table public.agents add column if not exists deleted_at timestamptz;
create index if not exists departments_active_created_idx on public.departments(created_by, created_at) where deleted_at is null;
create index if not exists agents_active_department_idx on public.agents(department_id, created_at) where deleted_at is null;

create or replace function public.is_department_member(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.department_members m
    where m.department_id = target_department_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_use_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.departments d
    where d.id = target_department_id
      and d.deleted_at is null
      and (d.created_by = auth.uid() or exists (
        select 1 from public.department_members m
        where m.department_id = d.id and m.user_id = auth.uid()
      ))
  );
$$;

create or replace function public.add_department_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.department_members (department_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists department_creator_membership on public.departments;
create trigger department_creator_membership
after insert on public.departments
for each row execute function public.add_department_creator_as_member();

-- Existing department owners must retain the same access as new creators.
insert into public.department_members (department_id, user_id)
select d.id, d.created_by
from public.departments d
on conflict do nothing;

drop policy if exists departments_visible on public.departments;
create policy departments_visible on public.departments for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or (deleted_at is null and public.is_department_member(public.departments.id))
);

drop policy if exists membership_visible on public.department_members;
create policy membership_visible on public.department_members for select using (
  public.is_workspace_admin() or user_id = auth.uid()
);

drop policy if exists membership_admin_write on public.department_members;
create policy membership_admin_write on public.department_members for all using (
  public.is_workspace_admin()
) with check (public.is_workspace_admin());

drop policy if exists agents_visible on public.agents;
create policy agents_visible on public.agents for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or (deleted_at is null and public.can_use_department(public.agents.department_id))
);

drop policy if exists agents_write on public.agents;
create policy agents_write on public.agents for all using (
  public.is_workspace_admin()
  or (created_by = auth.uid() and public.can_use_department(public.agents.department_id))
) with check (
  public.is_workspace_admin()
  or (created_by = auth.uid() and public.can_use_department(public.agents.department_id))
);

-- Normalize historical manager links before enforcing the stricter write trigger.
update public.agents manager
set subordinate_ids = coalesce((
  select array_agg(distinct subordinate.id)
  from public.agents subordinate
  where subordinate.id = any(manager.subordinate_ids)
    and subordinate.department_id = manager.department_id
    and subordinate.role_type = 'independent'
    and subordinate.deleted_at is null
), '{}'::uuid[])
where manager.role_type = 'manager';

update public.agents
set subordinate_ids = '{}'::uuid[]
where role_type <> 'manager' and cardinality(subordinate_ids) > 0;

create or replace function public.validate_agent_subordinates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_count integer;
  valid_count integer;
begin
  requested_count := cardinality(coalesce(new.subordinate_ids, '{}'::uuid[]));
  if requested_count = 0 then return new; end if;

  if new.role_type <> 'manager' then
    raise exception 'Only manager agents can have subordinates';
  end if;
  if new.id = any(new.subordinate_ids) then
    raise exception 'An agent cannot be its own subordinate';
  end if;

  select count(distinct a.id) into valid_count
  from public.agents a
  where a.id = any(new.subordinate_ids)
    and a.department_id = new.department_id
    and a.role_type = 'independent'
    and a.deleted_at is null;

  if valid_count <> requested_count then
    raise exception 'Subordinates must be independent agents in the same department';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_agent_subordinates_before_write on public.agents;
create trigger validate_agent_subordinates_before_write
before insert or update of department_id, role_type, subordinate_ids on public.agents
for each row execute function public.validate_agent_subordinates();

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all using (
  public.is_workspace_admin()
  or (created_by = auth.uid() and (department_id is null or public.can_use_department(department_id)))
) with check (
  public.is_workspace_admin()
  or (created_by = auth.uid() and (department_id is null or public.can_use_department(department_id)))
);

drop policy if exists tasks_visible on public.tasks;
create policy tasks_visible on public.tasks for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or (department_id is not null and public.can_use_department(department_id))
);

create or replace function public.validate_task_agent_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_department_id uuid;
  assigned_deleted_at timestamptz;
begin
  if new.assigned_agent_id is null then return new; end if;

  select a.department_id, a.deleted_at into assigned_department_id, assigned_deleted_at
  from public.agents a where a.id = new.assigned_agent_id;

  if assigned_department_id is null or assigned_deleted_at is not null or new.department_id is distinct from assigned_department_id then
    raise exception 'Assigned agent must be active and belong to the task department';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_task_agent_department_before_write on public.tasks;
create trigger validate_task_agent_department_before_write
before insert or update of department_id, assigned_agent_id on public.tasks
for each row execute function public.validate_task_agent_department();

drop policy if exists logs_delete_own on public.activity_logs;
create policy logs_delete_own on public.activity_logs for delete using (
  user_id = auth.uid() or public.is_workspace_admin()
);
