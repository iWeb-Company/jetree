-- Check effective privileges, including permissions inherited from PUBLIC.
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.handle_new_user()', 'public.add_department_creator_as_member()',
    'public.validate_agent_subordinates()', 'public.validate_task_agent_department()'
  ] loop
    if has_function_privilege('anon', signature, 'execute')
      or has_function_privilege('authenticated', signature, 'execute') then
      raise exception 'Trigger function is callable by a client: %', signature;
    end if;
    if not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Server execution missing: %', signature;
    end if;
  end loop;
  foreach signature in array array[
    'public.is_workspace_admin()', 'public.is_department_member(uuid)',
    'public.can_use_department(uuid)'
  ] loop
    if has_function_privilege('anon', signature, 'execute') then
      raise exception 'Anonymous RLS helper execution allowed: %', signature;
    end if;
    if not has_function_privilege('authenticated', signature, 'execute')
      or not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Required RLS helper execution missing: %', signature;
    end if;
  end loop;
  foreach signature in array array[
    'public.claim_telegram_updates(integer)', 'public.consume_workspace_execution_quota(integer)'
  ] loop
    if has_function_privilege('anon', signature, 'execute')
      or has_function_privilege('authenticated', signature, 'execute') then
      raise exception 'Server function exposed to clients: %', signature;
    end if;
  end loop;
end;
$$;
