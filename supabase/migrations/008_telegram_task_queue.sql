create table if not exists public.telegram_bots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_auth_tag text not null,
  secret_hash text not null,
  bot_username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.telegram_bots enable row level security;
revoke all on public.telegram_bots from anon, authenticated;
grant all on public.telegram_bots to service_role;

create table if not exists public.telegram_updates (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.telegram_bots(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  update_id bigint not null,
  chat_id bigint not null,
  sender_name text not null default 'Usuario',
  message_text text not null check (char_length(message_text) between 1 and 8000),
  status text not null default 'pending' check (status in ('pending','processing','delivery_pending','completed','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  response_text text,
  task_id uuid references public.tasks(id) on delete set null,
  trace_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bot_id, update_id)
);
create index if not exists telegram_updates_queue_idx on public.telegram_updates(status, next_attempt_at, created_at);
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from anon, authenticated;
grant all on public.telegram_updates to service_role;

create table if not exists public.telegram_chat_sessions (
  bot_id uuid not null references public.telegram_bots(id) on delete cascade,
  chat_id bigint not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (bot_id, chat_id)
);
alter table public.telegram_chat_sessions enable row level security;
revoke all on public.telegram_chat_sessions from anon, authenticated;
grant all on public.telegram_chat_sessions to service_role;

alter table public.tasks add column if not exists retry_count integer not null default 0;
alter table public.tasks add column if not exists last_error text;
alter table public.tasks add column if not exists trace_id uuid;
create index if not exists tasks_trace_id_idx on public.tasks(trace_id) where trace_id is not null;
alter table public.messages add column if not exists telegram_update_id uuid references public.telegram_updates(id) on delete set null;
create unique index if not exists messages_telegram_update_unique on public.messages(telegram_update_id) where telegram_update_id is not null;

create or replace function public.claim_telegram_updates(batch_size integer default 10)
returns setof public.telegram_updates language sql security definer set search_path = public as $$
  with picked as (
    select id from public.telegram_updates
    where ((status in ('pending','delivery_pending') and next_attempt_at <= now())
       or (status = 'processing' and locked_at < now() - interval '5 minutes'))
      and not exists (
        select 1 from public.telegram_updates earlier
        where earlier.bot_id = telegram_updates.bot_id
          and earlier.chat_id = telegram_updates.chat_id
          and earlier.created_at < telegram_updates.created_at
          and earlier.status in ('pending','processing','delivery_pending')
      )
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 25))
  ), claimed as (
    update public.telegram_updates u set status = case when u.status = 'delivery_pending' then 'delivery_pending' else 'processing' end,
      attempts = u.attempts + 1, locked_at = now(), updated_at = now()
    from picked where u.id = picked.id returning u.*
  ) select * from claimed;
$$;
revoke all on function public.claim_telegram_updates(integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_updates(integer) to service_role;
