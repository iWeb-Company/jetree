-- Disposable PostgreSQL only; rollback all fixtures.
begin;
insert into auth.users(id,email) values
 ('61000000-0000-0000-0000-000000000001','image-owner@example.invalid'),
 ('61000000-0000-0000-0000-000000000002','image-member@example.invalid'),
 ('61000000-0000-0000-0000-000000000003','image-outsider@example.invalid');
insert into public.departments(id,name,created_by) values ('62000000-0000-0000-0000-000000000001','Images','61000000-0000-0000-0000-000000000001');
insert into public.department_members(department_id,user_id) values ('62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
insert into public.agents(id,department_id,created_by,name,provider,model) values ('63000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','Images','gemini','synthetic');
insert into public.conversations(id,department_id,agent_id,created_by) values ('64000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001');
insert into public.messages(id,conversation_id,role,content) values ('65000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','assistant','Synthetic image');
insert into public.chat_images(owner_user_id,agent_id,message_id,object_path,mime_type,kind,byte_size) values
 ('61000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001',null,'pending','image/png','received',10),
 ('61000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','shared','image/png','generated',10);
insert into public.chat_images(owner_user_id,agent_id,object_path,mime_type,kind,byte_size,created_at) values ('61000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','expired','image/png','received',10,now()-interval '25 hours');
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
do $$ begin
 if (select count(*) from public.chat_images) <> 2 then raise exception 'Owner image visibility incorrect'; end if;
 if has_table_privilege(current_user,'public.chat_images','INSERT') or has_table_privilege(current_user,'public.chat_images','UPDATE') then raise exception 'Browser may write image metadata'; end if;
end $$;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000002',true);
do $$ begin
 if (select count(*) from public.chat_images) <> 1 or exists(select 1 from public.chat_images where message_id is null) then raise exception 'Member sees pending image'; end if;
end $$;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
do $$ begin
 if exists(select 1 from public.chat_images) then raise exception 'Outsider sees private images'; end if;
end $$;
reset role;
update public.agents set deleted_at=now() where id='63000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
do $$ begin
 if exists(select 1 from public.chat_images) then raise exception 'Archived agent images remain visible'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 if has_table_privilege(current_user,'public.chat_images','SELECT') then raise exception 'Anonymous media access'; end if;
end $$;
rollback;
