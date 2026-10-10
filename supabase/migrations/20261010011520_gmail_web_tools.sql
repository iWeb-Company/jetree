-- Extend connector allowlists without changing existing RLS or credential grants.
alter table public.tool_connections drop constraint tool_connections_provider_check;
alter table public.tool_connections add constraint tool_connections_provider_check check (provider in ('github', 'google_drive', 'gmail'));
alter table public.tool_oauth_states drop constraint tool_oauth_states_provider_check;
alter table public.tool_oauth_states add constraint tool_oauth_states_provider_check check (provider in ('github', 'google_drive', 'gmail'));
alter table public.tool_connection_audit drop constraint tool_connection_audit_provider_check;
alter table public.tool_connection_audit add constraint tool_connection_audit_provider_check check (provider in ('github', 'google_drive', 'gmail'));
alter table public.agent_tool_approvals drop constraint agent_tool_approvals_provider_check;
alter table public.agent_tool_approvals add constraint agent_tool_approvals_provider_check check (provider in ('github', 'google_drive', 'gmail', 'web_search'));
alter table public.agent_tool_calls drop constraint agent_tool_calls_provider_check;
alter table public.agent_tool_calls add constraint agent_tool_calls_provider_check check (provider in ('github', 'google_drive', 'gmail', 'web_search'));
