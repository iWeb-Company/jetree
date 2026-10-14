-- Cover the ownership FK for session cleanup and deletion.
create index coding_activity_session_owner_idx on public.coding_activity(session_id,user_id,executor_id);
