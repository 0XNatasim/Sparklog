-- 0157: the owner can SUBMIT a work sheet for the employee with the « Change the minutes » option (V2.4.310).
--
-- Same special switch as 0152 / 0154 / 0155 (overtime_settings.minute_edit_enabled, owner only, red banner while on) and the same
-- written reason (3-500 characters). submit_job_for_employee(job, reason) moves a saved / updated sheet (never approved, never
-- exported to the sheet) to « submitted », the way submit_manager_entry_for_employee (0137) does for an emergency entry, but for
-- ANY sheet of the employee. While it runs, sparklog.owner_submit = 'on' (set only by security definer functions, put back to
-- 'off' right after) so the submission validator skips ONLY the overtime proof and the month-end inventory check; the interval,
-- overlap and kilometre checks still apply. Already submitted = nothing to do (idempotent). One audit line per call
-- (job_submitted_by_owner with the reason and « via » = minute_edit). Replayable.

create or replace function public.submit_job_for_employee(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  clean_reason text := btrim(coalesce(p_reason, ''));
  target public.jobs%rowtype;
  person_name text;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if not coalesce((select s.minute_edit_enabled from public.overtime_settings s where s.id = true), false) then
    raise exception using errcode = '23514', message = 'minute_edit_disabled';
  end if;
  if p_job_id is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 500 then
    raise exception using errcode = '23514', message = 'minute_edit_reason_required';
  end if;

  select * into target from public.jobs j where j.id = p_job_id for update;
  if target.id is null then
    raise exception using errcode = 'P0002', message = 'job_not_found';
  end if;
  if target.status = 'submitted' and not coalesce(target.exported_to_sheet, false) then
    return; -- already submitted: nothing to do
  end if;
  if target.status not in ('saved', 'updated') or coalesce(target.exported_to_sheet, false) or target.locked then
    raise exception using errcode = '23514', message = 'job_not_editable';
  end if;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(target.user_id::text, 0));

  actor_name := public.audit_actor_name(actor_id);
  perform set_config('sparklog.owner_submit', 'on', true);
  update public.jobs j set status = 'submitted' where j.id = target.id;
  perform set_config('sparklog.owner_submit', 'off', true);

  select p.full_name into person_name from public.profiles p where p.id = target.user_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_submitted_by_owner', target.user_id, person_name, target.id,
          jsonb_build_object('job_date', target.job_date, 'ot', target.ot, 'via', 'minute_edit', 'reason', clean_reason));
end;
$function$;

revoke all on function public.submit_job_for_employee(uuid, text) from public, anon;
grant execute on function public.submit_job_for_employee(uuid, text) to authenticated;
