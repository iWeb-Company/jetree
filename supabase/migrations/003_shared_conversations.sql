create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_department_updated_idx
  on public.conversations(department_id, updated_at desc);
create index if not exists conversations_agent_updated_idx
  on public.conversations(agent_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 12000),
  delegation jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_department_read on public.conversations for select using (
  public.is_workspace_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.department_members m
    where m.department_id = public.conversations.department_id and m.user_id = auth.uid()
  )
);

create policy conversations_department_create on public.conversations for insert with check (
  created_by = auth.uid()
  and (
    public.is_workspace_admin()
    or exists (
      select 1 from public.department_members m
      where m.department_id = public.conversations.department_id and m.user_id = auth.uid()
    )
  )
);

create policy conversations_owner_update on public.conversations for update using (
  public.is_workspace_admin() or created_by = auth.uid()
) with check (public.is_workspace_admin() or created_by = auth.uid());

create policy messages_department_read on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = public.messages.conversation_id
      and (
        public.is_workspace_admin()
        or c.created_by = auth.uid()
        or exists (
          select 1 from public.department_members m
          where m.department_id = c.department_id and m.user_id = auth.uid()
        )
      )
  )
);

create policy messages_user_create on public.messages for insert with check (
  role = 'user'
  and author_user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = public.messages.conversation_id
      and (
        public.is_workspace_admin()
        or c.created_by = auth.uid()
        or exists (
          select 1 from public.department_members m
          where m.department_id = c.department_id and m.user_id = auth.uid()
        )
      )
  )
);
