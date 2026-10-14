alter table public.agents add column vision_model text check (vision_model is null or (length(vision_model) <= 180 and vision_model ~ '^[A-Za-z0-9_./:+-]+$'));
alter table public.agents add column image_provider public.provider_name;
alter table public.agents add column image_model text check (image_model is null or (length(image_model) <= 180 and image_model ~ '^[A-Za-z0-9_./:+-]+$'));
create table public.chat_images (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  kind text not null check (kind in ('received','generated')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_at timestamptz not null default now()
);
create index chat_images_message_idx on public.chat_images(message_id) where message_id is not null;
create index chat_images_pending_idx on public.chat_images(created_at) where message_id is null;
create index chat_images_agent_idx on public.chat_images(agent_id);
create index chat_images_owner_idx on public.chat_images(owner_user_id);
alter table public.chat_images enable row level security;
revoke all on public.chat_images from anon, authenticated;
grant select on public.chat_images to authenticated;
grant all on public.chat_images to service_role;
create policy chat_images_read on public.chat_images for select to authenticated using (
  exists (select 1 from public.agents a join public.departments d on d.id = a.department_id
    where a.id = chat_images.agent_id and a.deleted_at is null and d.deleted_at is null)
  and (
    (message_id is null and owner_user_id = auth.uid() and created_at > now() - interval '24 hours')
    or exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = chat_images.message_id and c.agent_id = chat_images.agent_id)
  )
);
alter table public.telegram_updates add column image_file jsonb;
alter table public.telegram_updates add column input_image_id uuid references public.chat_images(id) on delete set null;
alter table public.telegram_updates add column response_image_id uuid references public.chat_images(id) on delete set null;
alter table public.telegram_updates add column image_sent boolean not null default false;
alter table public.telegram_updates add column image_generation_started boolean not null default false;
alter table public.telegram_updates add column image_delivery_started boolean not null default false;
alter table public.telegram_updates add column response_text_sent boolean not null default false;
create index telegram_updates_input_image_idx on public.telegram_updates(input_image_id) where input_image_id is not null;
create index telegram_updates_response_image_idx on public.telegram_updates(response_image_id) where response_image_id is not null;
-- The disposable test database has no Supabase Storage schema.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      values ('chat-images', 'chat-images', false, 5242880, array['image/png','image/jpeg','image/webp'])
      on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
  end if;
end $$;
-- No storage.objects policies: only the server may read/write this private bucket.
