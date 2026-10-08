alter table public.tool_oauth_states
  add column if not exists github_access text not null default 'public'
  check (github_access in ('public', 'private'));

comment on column public.tool_oauth_states.github_access is
  'Explicit GitHub access requested by the user for this one OAuth flow.';
