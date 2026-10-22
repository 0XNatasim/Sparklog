-- 0112: diagnostic of a picture the phone could not read (V2.4.170).
--
-- When the app cannot read or prepare a picture the employee picked (overtime SMS screenshot, inventory
-- screenshot, parking receipt), it records WHY in the Journal, without the picture: file size and type,
-- how old the file was, which step failed (read / type / decode / encode), the error name, how many read
-- attempts were made, and the phone's browser. A 0-byte file points to a picture that is only in the cloud
-- (Google Photos), a few seconds' age to a screenshot still being saved. Managers read the Journal as
-- before (audit_log: managers read); employees can only add their own entry through this function.
-- Only known keys are kept, values are truncated, and each account is limited to 20 entries an hour.

create or replace function public.log_file_read_error(p_context text, p_details jsonb)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_details jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_context is null or p_context not in ('overtime', 'inventory', 'parking') then
    raise exception using errcode = '22023', message = 'invalid_context';
  end if;
  if (select count(*) from public.audit_log a
       where a.actor_id = v_uid and a.action = 'file_read_error' and a.created_at > now() - interval '1 hour') >= 20 then
    return; -- enough to diagnose; never block the employee
  end if;

  for v_key, v_value in select key, value from jsonb_each(coalesce(p_details, '{}'::jsonb)) loop
    if v_key in ('size', 'age_s', 'attempts') and jsonb_typeof(v_value) = 'number' then
      v_details := v_details || jsonb_build_object(v_key, v_value);
    elsif v_key in ('type', 'step', 'error', 'reason', 'browser', 'app') and jsonb_typeof(v_value) = 'string' then
      v_details := v_details || jsonb_build_object(v_key, left(v_value #>> '{}', case when v_key = 'browser' then 200 else 80 end));
    end if;
  end loop;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
  values (v_uid, public.audit_actor_name(v_uid), 'file_read_error', v_uid, public.audit_actor_name(v_uid),
          v_details || jsonb_build_object('context', p_context));
end;
$$;

revoke all on function public.log_file_read_error(text, jsonb) from public, anon;
grant execute on function public.log_file_read_error(text, jsonb) to authenticated;
