alter table public.telegram_bots
  add column tool_chat_id bigint,
  add column tool_user_id bigint,
  add column tool_pair_hash text,
  add column tool_pair_expires_at timestamptz;
alter table public.telegram_updates
  add column sender_user_id bigint,
  add column chat_type text,
  add column tool_event jsonb,
  add column tool_response boolean not null default false,
  add column pending_approval_id uuid references public.agent_tool_approvals(id) on delete set null;
alter table public.telegram_chat_sessions add column tools_authorized boolean not null default false;

create table public.telegram_tool_approvals (
  approval_id uuid primary key references public.agent_tool_approvals(id) on delete cascade,
  bot_id uuid not null references public.telegram_bots(id) on delete cascade,
  chat_id bigint not null,
  telegram_user_id bigint not null,
  created_at timestamptz not null default now()
);
create index telegram_tool_approvals_bot_idx on public.telegram_tool_approvals(bot_id);
alter table public.telegram_tool_approvals enable row level security;
revoke all on public.telegram_tool_approvals from public, anon, authenticated;
grant all on public.telegram_tool_approvals to service_role;
