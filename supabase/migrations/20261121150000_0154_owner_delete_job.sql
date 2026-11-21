-- 0154: the owner can delete a work sheet with the « Change the minutes » option (V2.4.297).
--
-- Same special switch as 0152 (overtime_settings.minute_edit_enabled, owner only, red banner while on). With it on,
-- delete_job_for_employee(job, reason) deletes a saved / updated / submitted sheet (never approved, never exported to the
-- sheet), with a written reason (3-500 characters). The sheet is copied into the audit log first (job_deleted_by_owner: who,
-- date, OT, times, kilometres, status, reason), so a deletion can always be traced and the sheet rebuilt by hand.
-- What hangs on the sheet follows the existing rules: its overtime proofs move to another sheet of the same day when there is one
-- (rehome_overtime_evidence_before_job_delete, 0068), otherwise they go with it; its meal claim, parking receipts and
-- notifications go with it (foreign keys on delete cascade). The day's proofs are then re-evaluated by 0153 (kept, marked
-- not needed when the day is under the line). Replayable.

create or replace function public.delete_job_for_employee(p_job_id uuid, p_reason text)
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
  if target.status not in ('saved', 'updated', 'submitted') or coalesce(target.exported_to_sheet, false) then
    raise exception using errcode = '23514', message = 'job_not_editable';
  end if;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(target.user_id::text, 0));

  actor_name := public.audit_actor_name(actor_id);
  select p.full_name into person_name from public.profiles p where p.id = target.user_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_deleted_by_owner', target.user_id, person_name, target.id,
          jsonb_build_object('job_date', target.job_date, 'ot', target.ot, 'status', target.status,
                             'depart', target.depart, 'arrivee', target.arrivee, 'fin', target.fin,
                             'km_total', target.km_total, 'km_aller', target.km_aller, 'km_retour', target.km_retour,
                             'return_time_minutes', target.return_time_minutes, 'reason', clean_reason));

  delete from public.jobs where id = target.id;
end;
$function$;

revoke all on function public.delete_job_for_employee(uuid, text) from public, anon;
grant execute on function public.delete_job_for_employee(uuid, text) to authenticated;
