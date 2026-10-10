-- Disposable database only. Every fixture is rolled back.
begin;
insert into auth.users(id,email) values ('60000000-0000-0000-0000-000000000001','audio@example.test');
set local role service_role;
do $$
declare owner_id uuid := '60000000-0000-0000-0000-000000000001';
  department uuid; agent_one uuid; agent_two uuid; bot_one uuid; bot_two uuid; claimed integer;
begin
  insert into public.departments(name,created_by) values('Audio queue CI',owner_id) returning id into department;
  insert into public.agents(name,department_id,created_by,provider,model) values('Audio one',department,owner_id,'gemini','synthetic') returning id into agent_one;
  insert into public.agents(name,department_id,created_by,provider,model) values('Audio two',department,owner_id,'gemini','synthetic') returning id into agent_two;
  insert into public.telegram_bots(agent_id,owner_user_id,token_ciphertext,token_iv,token_auth_tag,secret_hash) values(agent_one,owner_id,'synthetic','iv','tag','hash') returning id into bot_one;
  insert into public.telegram_bots(agent_id,owner_user_id,token_ciphertext,token_iv,token_auth_tag,secret_hash) values(agent_two,owner_id,'synthetic','iv','tag','hash') returning id into bot_two;
  -- Deliberately share created_at: no batch may claim both messages in the same chat.
  insert into public.telegram_updates(bot_id,agent_id,update_id,chat_id,message_text,audio_file)
    values(bot_one,agent_one,1,1,'audio','{"fileId":"synthetic","mimeType":"audio/ogg","duration":3}'),
      (bot_one,agent_one,2,1,'next',null), (bot_two,agent_two,1,1,'other bot',null);
  select count(*) into claimed from public.claim_telegram_updates_for_bot(bot_one,25);
  if claimed <> 1 then raise exception 'Same-chat messages claimed together'; end if;
  if exists(select 1 from public.telegram_updates where bot_id=bot_two and status <> 'pending') then raise exception 'Webhook claimed another bot'; end if;
  select count(*) into claimed from public.claim_telegram_updates_for_bot(bot_one,2);
  if claimed <> 0 then raise exception 'In-flight predecessor bypassed'; end if;
  update public.telegram_updates set status='completed',audio_transcript='Synthetic transcript' where bot_id=bot_one and status='processing';
  select count(*) into claimed from public.claim_telegram_updates_for_bot(bot_one,2);
  if claimed <> 1 then raise exception 'Next chat message not released'; end if;
  select count(*) into claimed from public.claim_telegram_updates(2);
  if claimed <> 1 then raise exception 'Scheduler and webhook did not share locks/order'; end if;
  -- Persisting a reply keeps the processing lease until delivery finishes.
  update public.telegram_updates set status='delivery_pending' where status='processing';
  select count(*) into claimed from public.claim_telegram_updates(25);
  if claimed <> 0 then raise exception 'Scheduler reclaimed an active delivery'; end if;
  select count(*) into claimed from public.claim_telegram_updates_for_bot(bot_one,2);
  if claimed <> 0 then raise exception 'Webhook reclaimed an active delivery'; end if;
  update public.telegram_updates set locked_at=now()-interval '6 minutes' where bot_id=bot_one and status='delivery_pending';
  select count(*) into claimed from public.claim_telegram_updates_for_bot(bot_one,2);
  if claimed <> 1 then raise exception 'Expired delivery lease was not recovered'; end if;
  select count(*) into claimed from public.claim_telegram_updates(25);
  if claimed <> 0 then raise exception 'Scheduler bypassed recovered delivery lease'; end if;
  update public.telegram_updates set locked_at=null where bot_id=bot_two and status='delivery_pending';
  select count(*) into claimed from public.claim_telegram_updates(25);
  if claimed <> 1 then raise exception 'Unlocked delivery retry was not claimed'; end if;
end $$;
rollback;
