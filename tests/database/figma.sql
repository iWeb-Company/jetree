-- Disposable database only. Never run bootstrap on an existing environment.
begin;
insert into auth.users(id,email) values ('71000000-0000-0000-0000-000000000001','figma-owner@example.invalid');
insert into public.departments(id,name,created_by) values ('72000000-0000-0000-0000-000000000001','Figma test','71000000-0000-0000-0000-000000000001');
insert into public.agents(id,department_id,created_by,name,provider,model,enabled_tool_ids) values ('73000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Figma test','gemini','synthetic',array['plugin-figma-core']);
insert into public.tool_connections(user_id,provider,ciphertext,iv,auth_tag,status) values ('71000000-0000-0000-0000-000000000001','figma','synthetic','synthetic','synthetic','connected');
insert into public.figma_files(user_id,file_key,name) values ('71000000-0000-0000-0000-000000000001','Synthetic123','Figma');
insert into public.figma_sessions(id,user_id,file_key,token_hash,marker,verified,expires_at) values
 ('74000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Synthetic123','synthetic1','marker1',true,now()+interval '1 day'),
 ('74000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','Synthetic123','synthetic2','marker2',true,now()+interval '1 day');
insert into public.agent_tool_approvals(id,user_id,agent_id,tool_id,provider,operation,input,status) values
 ('75000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','plugin-figma-core','figma','apply_figma_changes','{}','completed'),
 ('75000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','plugin-figma-core','figma','apply_figma_changes','{}','completed');
insert into public.figma_jobs(id,user_id,file_key,agent_id,approval_id,commands,summary,created_at) values
 ('76000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Synthetic123','73000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001','[{"op":"create_frame"}]','First',now()-interval '1 minute'),
 ('76000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','Synthetic123','73000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','[{"op":"create_text"}]','Second',now());
set local role authenticated;
do $$ declare t text; begin
 foreach t in array array['figma_files','figma_pair_codes','figma_sessions','figma_jobs'] loop
  if has_table_privilege(current_user,'public.'||t,'select') or has_table_privilege(current_user,'public.'||t,'insert') then raise exception 'Direct client Figma access: %',t;end if;
 end loop;
 if has_function_privilege(current_user,'public.claim_figma_job(uuid,uuid)','execute') then raise exception 'Browser can claim jobs';end if;
end $$;
reset role;
set local role service_role;
do $$ declare j public.figma_jobs;begin
 select * into j from public.claim_figma_job('74000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000099');
 if found then raise exception 'Foreign owner claimed session';end if;
 select * into j from public.claim_figma_job('74000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001');
 if j.id is distinct from '76000000-0000-0000-0000-000000000001'::uuid or j.status<>'leased' then raise exception 'FIFO claim failed';end if;
 select * into j from public.claim_figma_job('74000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001');
 if found then raise exception 'Two plugins claimed the same file';end if;
end $$;
update public.figma_jobs set lease_until=now()-interval '1 second' where id='76000000-0000-0000-0000-000000000001';
do $$ begin
 if exists(select 1 from public.claim_figma_job('74000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001')) then raise exception 'Expired lease allowed more edits';end if;
 if not exists(select 1 from public.figma_jobs where id='76000000-0000-0000-0000-000000000001' and status='uncertain') then raise exception 'Expired edit was not uncertain';end if;
end $$;
update public.figma_jobs set status='cancelled' where id='76000000-0000-0000-0000-000000000001';
update public.agents set enabled_tool_ids='{}' where id='73000000-0000-0000-0000-000000000001';
do $$ begin
 if exists(select 1 from public.claim_figma_job('74000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001')) then raise exception 'Disabled connector executed a queued edit';end if;
 if not exists(select 1 from public.figma_jobs where id='76000000-0000-0000-0000-000000000002' and status='cancelled') then raise exception 'Disabled job not cancelled';end if;
end $$;
reset role;
rollback;
