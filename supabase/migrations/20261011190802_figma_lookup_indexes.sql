-- Cover the composite file foreign keys and owner/file pairing lookups.
create index figma_pair_codes_file_idx on public.figma_pair_codes(user_id,file_key);
create index figma_sessions_file_idx on public.figma_sessions(user_id,file_key);
