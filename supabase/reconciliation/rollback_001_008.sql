-- Emergency schema rollback; keep the application offline.
-- Refuses to discard any rows in added tables. Recover original data from the verified backup if needed.
-- History remains intact; execute through apply_migration if required.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public."activity_logs",public."agents",public."department_members",public."departments",public."profiles",public."provider_connections",public."tasks" in access exclusive mode;
do $guard$ begin
if exists(select 1 from public."agent_executions" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: agent_executions'; end if;
if exists(select 1 from public."agent_tool_approvals" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: agent_tool_approvals'; end if;
if exists(select 1 from public."agent_tool_calls" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: agent_tool_calls'; end if;
if exists(select 1 from public."conversations" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: conversations'; end if;
if exists(select 1 from public."messages" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: messages'; end if;
if exists(select 1 from public."provider_connection_audit" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: provider_connection_audit'; end if;
if exists(select 1 from public."provider_connection_secrets" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: provider_connection_secrets'; end if;
if exists(select 1 from public."telegram_bots" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: telegram_bots'; end if;
if exists(select 1 from public."telegram_chat_sessions" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: telegram_chat_sessions'; end if;
if exists(select 1 from public."telegram_updates" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: telegram_updates'; end if;
if exists(select 1 from public."tool_connection_audit" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: tool_connection_audit'; end if;
if exists(select 1 from public."tool_connections" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: tool_connections'; end if;
if exists(select 1 from public."tool_oauth_states" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: tool_oauth_states'; end if;
if exists(select 1 from public."workspace_daily_execution_usage" limit 1) then raise exception 'ROLLBACK_BLOCKED: added table contains data: workspace_daily_execution_usage'; end if;
if exists(select 1 from public.agents where provider::text='custom') or exists(select 1 from public.provider_connections where provider::text='custom') then raise exception 'ROLLBACK_BLOCKED: custom provider in use'; end if;
end $guard$;
drop policy "logs_delete_own" on public."activity_logs";
drop policy "logs_insert" on public."activity_logs";
drop policy "logs_visible" on public."activity_logs";
drop policy "agents_visible" on public."agents";
drop policy "agents_write" on public."agents";
drop policy "membership_admin_write" on public."department_members";
drop policy "membership_visible" on public."department_members";
drop policy "departments_admin_write" on public."departments";
drop policy "departments_visible" on public."departments";
drop policy "profiles_self_or_admin" on public."profiles";
drop policy "connections_owner" on public."provider_connections";
drop policy "tasks_visible" on public."tasks";
drop policy "tasks_write" on public."tasks";
drop trigger "validate_agent_subordinates_before_write" on "public"."agents";
drop trigger "department_creator_membership" on "public"."departments";
drop trigger "validate_task_agent_department_before_write" on "public"."tasks";
drop function public."claim_telegram_updates"(batch_size integer);
drop table public."agent_executions",public."agent_tool_approvals",public."agent_tool_calls",public."conversations",public."messages",public."provider_connection_audit",public."provider_connection_secrets",public."telegram_bots",public."telegram_chat_sessions",public."telegram_updates",public."tool_connection_audit",public."tool_connections",public."tool_oauth_states",public."workspace_daily_execution_usage";
drop function public."add_department_creator_as_member"();
drop function public."can_use_department"(target_department_id uuid);

drop function public."consume_workspace_execution_quota"(max_runs integer);
drop function public."is_department_member"(target_department_id uuid);
drop function public."validate_agent_subordinates"();
drop function public."validate_task_agent_department"();
alter table public."provider_connections" drop constraint "provider_connections_connection_type_check";
alter table public."provider_connections" drop constraint "provider_connections_last_error_code_check";
alter table public."provider_connections" drop constraint "provider_connections_status_check";
drop index public."agents_active_department_idx";
drop index public."departments_active_created_idx";
drop index public."tasks_trace_id_idx";
alter table public."agents" drop column "deleted_at";
alter table public."departments" drop column "deleted_at";
alter table public."provider_connections" drop column "connection_type";
alter table public."provider_connections" drop column "last_checked_at";
alter table public."provider_connections" drop column "last_error_code";
alter table public."tasks" drop column "retry_count";
alter table public."tasks" drop column "last_error";
alter table public."tasks" drop column "trace_id";
create type public.provider_name_restore as enum ('openai','gemini','claude');
alter table public.agents alter column provider type public.provider_name_restore using provider::text::public.provider_name_restore;
alter table public.provider_connections alter column provider type public.provider_name_restore using provider::text::public.provider_name_restore;
drop type public.provider_name;
alter type public.provider_name_restore rename to provider_name;
alter table public."provider_connections" add constraint "provider_connections_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'expired'::text, 'error'::text, 'disconnected'::text])));
create policy "logs_insert" on public."activity_logs" as PERMISSIVE for INSERT to "public"  with check (((user_id = auth.uid()) OR is_workspace_admin()));
create policy "logs_visible" on public."activity_logs" as PERMISSIVE for SELECT to "public" using ((is_workspace_admin() OR (user_id = auth.uid()))) ;
create policy "agents_visible" on public."agents" as PERMISSIVE for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = m.department_id) AND (m.user_id = auth.uid())))))) ;
create policy "agents_write" on public."agents" as PERMISSIVE for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
create policy "membership_admin_write" on public."department_members" as PERMISSIVE for ALL to "public" using (is_workspace_admin()) with check (is_workspace_admin());
create policy "membership_visible" on public."department_members" as PERMISSIVE for SELECT to "public" using ((is_workspace_admin() OR (user_id = auth.uid()))) ;
create policy "departments_visible" on public."departments" as PERMISSIVE for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = departments.id) AND (m.user_id = auth.uid())))))) ;
create policy "departments_write" on public."departments" as PERMISSIVE for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
create policy "profiles_self_or_admin" on public."profiles" as PERMISSIVE for SELECT to "public" using (((id = auth.uid()) OR is_workspace_admin())) ;
create policy "connections_owner" on public."provider_connections" as PERMISSIVE for ALL to "public" using (((user_id = auth.uid()) OR is_workspace_admin())) with check (((user_id = auth.uid()) OR is_workspace_admin()));
create policy "tasks_visible" on public."tasks" as PERMISSIVE for SELECT to "public" using ((is_workspace_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM department_members m
  WHERE ((m.department_id = m.department_id) AND (m.user_id = auth.uid())))))) ;
create policy "tasks_write" on public."tasks" as PERMISSIVE for ALL to "public" using ((is_workspace_admin() OR (created_by = auth.uid()))) with check ((is_workspace_admin() OR (created_by = auth.uid())));
grant all on all tables in schema public to anon,authenticated,service_role;
commit;


