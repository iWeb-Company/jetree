-- Jetree production foundation: tenant ownership, memberships and RLS.
create extension if not exists pgcrypto;

create type public.workspace_role as enum ('admin', 'member');
create type public.agent_role_type as enum ('independent', 'manager');
create type public.provider_name as enum ('openai', 'gemini', 'claude');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  icon text not null default '🌳',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.department_members (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, user_id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  role_type public.agent_role_type not null default 'independent',
  provider public.provider_name not null,
  model text not null,
  system_prompt text not null default '',
  subordinate_ids uuid[] not null default '{}',
  enabled_tool_ids text[] not null default '{}',
  status text not null default 'idle' check (status in ('idle', 'working', 'offline')),
  avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.provider_name not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  status text not null default 'disconnected' check (status in ('connected', 'expired', 'error', 'disconnected')),
  metadata jsonb not null default '{}',
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  source_channel text not null default 'web' check (source_channel in ('web', 'telegram', 'api')),
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  event_type text not null,
  message text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    lower(new.email),
    case when lower(new.email) in (
      'facundod@iwebtecnology.com',
      'valentind@iwebtecnology.com',
      'tomasb@iwebtecnology.com'
    ) then 'admin'::public.workspace_role else 'member'::public.workspace_role end
  ) on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.agents enable row level security;
alter table public.provider_connections enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;

create policy profiles_self_or_admin on public.profiles for select using (id = auth.uid() or public.is_workspace_admin());
create policy departments_visible on public.departments for select using (
  public.is_workspace_admin() or created_by = auth.uid() or exists (select 1 from public.department_members m where m.department_id = id and m.user_id = auth.uid())
);
create policy departments_admin_write on public.departments for all using (public.is_workspace_admin() or created_by = auth.uid()) with check (public.is_workspace_admin() or created_by = auth.uid());
create policy membership_visible on public.department_members for select using (public.is_workspace_admin() or user_id = auth.uid());
create policy membership_admin_write on public.department_members for all using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy agents_visible on public.agents for select using (public.is_workspace_admin() or created_by = auth.uid() or exists (select 1 from public.department_members m where m.department_id = department_id and m.user_id = auth.uid()));
create policy agents_write on public.agents for all using (public.is_workspace_admin() or created_by = auth.uid()) with check (public.is_workspace_admin() or created_by = auth.uid());
create policy connections_owner on public.provider_connections for all using (user_id = auth.uid() or public.is_workspace_admin()) with check (user_id = auth.uid() or public.is_workspace_admin());
create policy tasks_visible on public.tasks for select using (public.is_workspace_admin() or created_by = auth.uid() or exists (select 1 from public.department_members m where m.department_id = department_id and m.user_id = auth.uid()));
create policy tasks_write on public.tasks for all using (public.is_workspace_admin() or created_by = auth.uid()) with check (public.is_workspace_admin() or created_by = auth.uid());
create policy logs_visible on public.activity_logs for select using (public.is_workspace_admin() or user_id = auth.uid());
create policy logs_insert on public.activity_logs for insert with check (user_id = auth.uid() or public.is_workspace_admin());
