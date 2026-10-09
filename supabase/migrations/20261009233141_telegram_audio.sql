alter table public.telegram_updates
  add column audio_file jsonb,
  add column audio_transcript text check (char_length(audio_transcript) <= 7500);

-- Same queue lock/order as the scheduler, restricted to the authenticated webhook's bot.
create function public.claim_telegram_updates_for_bot(target_bot uuid, batch_size integer default 2)
returns setof public.telegram_updates language sql security invoker set search_path = public as $$
  with picked as (
    select id from public.telegram_updates u
    where u.bot_id = target_bot
      and ((u.status in ('pending','delivery_pending') and u.next_attempt_at <= now())
        or (u.status = 'processing' and u.locked_at < now() - interval '5 minutes'))
      and not exists (
        select 1 from public.telegram_updates earlier
        where earlier.bot_id = u.bot_id and earlier.chat_id = u.chat_id
          and (earlier.created_at, earlier.id) < (u.created_at, u.id)
          and earlier.status in ('pending','processing','delivery_pending')
      )
    order by created_at, id for update skip locked
    limit greatest(1, least(batch_size, 2))
  ), claimed as (
    update public.telegram_updates u set
      status = case when u.status = 'delivery_pending' then 'delivery_pending' else 'processing' end,
      attempts = u.attempts + 1, locked_at = now(), updated_at = now()
    from picked where u.id = picked.id returning u.*
  ) select * from claimed;
$$;
revoke all on function public.claim_telegram_updates_for_bot(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_telegram_updates_for_bot(uuid,integer) to service_role;

-- Share the same deterministic chat order with the fallback scheduler, including timestamp ties.
create or replace function public.claim_telegram_updates(batch_size integer default 10)
returns setof public.telegram_updates language sql security definer set search_path = public as $$
  with picked as (
    select id from public.telegram_updates u
    where ((u.status in ('pending','delivery_pending') and u.next_attempt_at <= now())
       or (u.status = 'processing' and u.locked_at < now() - interval '5 minutes'))
      and not exists (
        select 1 from public.telegram_updates earlier
        where earlier.bot_id = u.bot_id and earlier.chat_id = u.chat_id
          and (earlier.created_at, earlier.id) < (u.created_at, u.id)
          and earlier.status in ('pending','processing','delivery_pending')
      )
    order by created_at, id for update skip locked
    limit greatest(1, least(batch_size, 25))
  ), claimed as (
    update public.telegram_updates u set
      status = case when u.status = 'delivery_pending' then 'delivery_pending' else 'processing' end,
      attempts = u.attempts + 1, locked_at = now(), updated_at = now()
    from picked where u.id = picked.id returning u.*
  ) select * from claimed;
$$;
