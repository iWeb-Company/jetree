create table public.chat_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  execution_id uuid not null references public.agent_executions(id) on delete cascade,
  object_path text not null unique,
  name text not null check(length(name) between 1 and 110),
  mime_type text not null check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/html')),
  byte_size integer not null check(byte_size between 1 and 5242880),
  telegram_delivery_started boolean not null default false,
  telegram_delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_files_message_idx on public.chat_files(message_id);
create index chat_files_agent_idx on public.chat_files(agent_id);
create index chat_files_owner_idx on public.chat_files(owner_user_id);
create index chat_files_execution_idx on public.chat_files(execution_id);
alter table public.chat_files enable row level security;
revoke all on public.chat_files from anon,authenticated;
grant select on public.chat_files to authenticated;
grant all on public.chat_files to service_role;
create policy chat_files_read on public.chat_files for select to authenticated using (
  message_id is not null and exists (
    select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    join public.agents a on a.id=c.agent_id join public.departments d on d.id=a.department_id
    where m.id=chat_files.message_id and c.agent_id=chat_files.agent_id and a.deleted_at is null and d.deleted_at is null
  )
);
alter table public.telegram_updates add column response_file_ids uuid[] not null default '{}';
alter table public.telegram_updates add column file_generation_started boolean not null default false;
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('chat-files','chat-files',false,5242880,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/html'])
    on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  end if;
end $$;
