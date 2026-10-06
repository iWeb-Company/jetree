-- Reconstructed from catalog metadata only, 2026-10-06. No real rows.
-- Disposable PostgreSQL test fixture. Requires tests/database/bootstrap.sql.
create type public."agent_role_type" as enum ('independent', 'manager');
create type public."provider_name" as enum ('openai', 'gemini', 'claude');
create type public."workspace_role" as enum ('admin', 'member');
create table public."activity_logs" (
  "id" "uuid" default gen_random_uuid() not null,
  "user_id" "uuid" not null,
  "agent_id" "uuid",
  "event_type" "text" not null,
  "message" "text" not null,
  "details" "jsonb" default '{}'::jsonb not null,
  "created_at" "timestamptz" default now() not null
);
alter table public."activity_logs" enable row level security;
create table public."agents" (
  "id" "uuid" default gen_random_uuid() not null,
  "department_id" "uuid" not null,
  "created_by" "uuid" not null,
  "name" "text" not null,
  "description" "text" default ''::text not null,
  "role_type" "agent_role_type" default 'independent'::agent_role_type not null,
  "provider" "provider_name" not null,
  "model" "text" not null,
  "system_prompt" "text" default ''::text not null,
  "subordinate_ids" "uuid"[] default '{}'::uuid[] not null,
  "enabled_tool_ids" "text"[] default '{}'::text[] not null,
  "status" "text" default 'idle'::text not null,
  "avatar" "text",
  "created_at" "timestamptz" default now() not null,
  "updated_at" "timestamptz" default now() not null
);
alter table public."agents" enable row level security;
create table public."department_members" (
  "department_id" "uuid" not null,
  "user_id" "uuid" not null,
  "created_at" "timestamptz" default now() not null
);
alter table public."department_members" enable row level security;
create table public."departments" (
  "id" "uuid" default gen_random_uuid() not null,
  "name" "text" not null,
  "description" "text" default ''::text not null,
  "icon" "text" default '🌳'::text not null,
  "created_by" "uuid" not null,
  "created_at" "timestamptz" default now() not null
);
alter table public."departments" enable row level security;
create table public."profiles" (
  "id" "uuid" not null,
  "email" "text" not null,
  "role" "workspace_role" default 'member'::workspace_role not null,
  "created_at" "timestamptz" default now() not null
);
alter table public."profiles" enable row level security;
create table public."provider_connections" (
  "id" "uuid" default gen_random_uuid() not null,
  "user_id" "uuid" not null,
  "provider" "provider_name" not null,
  "access_token_encrypted" "text",
  "refresh_token_encrypted" "text",
  "status" "text" default 'disconnected'::text not null,
  "metadata" "jsonb" default '{}'::jsonb not null,
  "connected_at" "timestamptz",
  "updated_at" "timestamptz" default now() not null
);
alter table public."provider_connections" enable row level security;
create table public."tasks" (
  "id" "uuid" default gen_random_uuid() not null,
  "department_id" "uuid",
  "assigned_agent_id" "uuid",
  "created_by" "uuid" not null,
  "title" "text" not null,
  "description" "text" default ''::text not null,
  "status" "text" default 'pending'::text not null,
  "source_channel" "text" default 'web'::text not null,
  "result" "text",
  "created_at" "timestamptz" default now() not null,
  "updated_at" "timestamptz" default now() not null
);
alter table public."tasks" enable row level security;
alter table public."activity_logs" add constraint "activity_logs_pkey" PRIMARY KEY (id);
alter table public."agents" add constraint "agents_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)));
alter table public."agents" add constraint "agents_pkey" PRIMARY KEY (id);
alter table public."agents" add constraint "agents_status_check" CHECK ((status = ANY (ARRAY['idle'::text, 'working'::text, 'offline'::text])));
alter table public."department_members" add constraint "department_members_pkey" PRIMARY KEY (department_id, user_id);
alter table public."departments" add constraint "departments_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)));
alter table public."departments" add constraint "departments_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."provider_connections" add constraint "provider_connections_pkey" PRIMARY KEY (id);
alter table public."provider_connections" add constraint "provider_connections_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'expired'::text, 'error'::text, 'disconnected'::text])));
alter table public."provider_connections" add constraint "provider_connections_user_id_provider_key" UNIQUE (user_id, provider);
alter table public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);
alter table public."tasks" add constraint "tasks_source_channel_check" CHECK ((source_channel = ANY (ARRAY['web'::text, 'telegram'::text, 'api'::text])));
alter table public."tasks" add constraint "tasks_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])));
alter table public."activity_logs" add constraint "activity_logs_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
alter table public."activity_logs" add constraint "activity_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."agents" add constraint "agents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."agents" add constraint "agents_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
alter table public."department_members" add constraint "department_members_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
alter table public."department_members" add constraint "department_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."departments" add constraint "departments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."provider_connections" add constraint "provider_connections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tasks" add constraint "tasks_assigned_agent_id_fkey" FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
alter table public."tasks" add constraint "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."tasks" add constraint "tasks_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin insert into public.profiles (id,email,role) values (new.id,lower(new.email),case when lower(new.email) in ('facundod@iwebtecnology.com','valentind@iwebtecnology.com','tomasb@iwebtecnology.com') then 'admin'::public.workspace_role else 'member'::public.workspace_role end) on conflict (id) do update set email=excluded.email; return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.is_workspace_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $function$
;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
create policy "logs_insert" on public."activity_logs" for INSERT to "public" with check (((user_id = auth.uid()) OR is_workspace_admin()));
create policy "logs_visible" on public."activity_logs" for SELECT to "public" using ((is_workspace_admin() OR (user_id = auth.uid())));
create policy "agents_visible" on public."agents" for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = m.department_id) AND (m.user_id = auth.uid()))))));
create policy "agents_write" on public."agents" for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
create policy "membership_admin_write" on public."department_members" for ALL to "public" using (is_workspace_admin()) with check (is_workspace_admin());
create policy "membership_visible" on public."department_members" for SELECT to "public" using ((is_workspace_admin() OR (user_id = auth.uid())));
create policy "departments_visible" on public."departments" for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = departments.id) AND (m.user_id = auth.uid()))))));
create policy "departments_write" on public."departments" for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
create policy "profiles_self_or_admin" on public."profiles" for SELECT to "public" using (((id = auth.uid()) OR is_workspace_admin()));
create policy "connections_owner" on public."provider_connections" for ALL to "public" using (((user_id = auth.uid()) OR is_workspace_admin())) with check (((user_id = auth.uid()) OR is_workspace_admin()));
create policy "tasks_visible" on public."tasks" for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = m.department_id) AND (m.user_id = auth.uid()))))));
create policy "tasks_write" on public."tasks" for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
