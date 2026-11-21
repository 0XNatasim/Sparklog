-- 0155: the owner can add the overtime proof of an employee's work sheet with the « Change the minutes » option (V2.4.298).
--
-- Same special switch as 0152 / 0154 (overtime_settings.minute_edit_enabled, owner only, red banner while on).
-- 1) Storage: the owner (is_privileged() = owner + aal2) may upload into any folder of the overtime-evidence bucket, so the
--    picture lands in the EMPLOYEE's folder (<employee id>/<date>/<uuid>.jpg) like the ones the employee sends: the employee
--    then sees it in the History like the others (their "owner read" policy of 0144 is by folder). Nobody else gains anything.
-- 2) add_overtime_proof_for_employee(job, evidence id, path, daily minutes, reason): switch on (else minute_edit_disabled),
--    reason 3-500 characters (minute_edit_reason_required), sheet saved / updated / submitted and not exported
--    (job_not_editable), path <employee>/<job date>/..., file really in the bucket and uploaded by the caller
--    (evidence_file_missing), idempotent per evidence id, per-employee lock. It adds the proof row (reading queued: the OCR
--    queue reads it like any proof), marks the sheet as carrying a proof, and writes overtime_proof_added_by_owner in the Journal.
--    No notification is sent to the managers (the owner is the one adding it). Replayable.

drop policy if exists "overtime storage: owner upload for employee" on storage.objects;
create policy "overtime storage: owner upload for employee"
on storage.objects
for insert to authenticated
with check (bucket_id = 'overtime-evidence' and public.is_privileged());

create or replace function public.add_overtime_proof_for_employee(
  p_job_id uuid, p_evidence_id uuid, p_storage_path text, p_daily_minutes integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  clean_reason text := btrim(coalesce(p_reason, ''));
  target public.jobs%rowtype;
  existing_id uuid;
  retention integer;
  minutes integer := least(greatest(coalesce(p_daily_minutes, 0), 0), 1440);
  person_name text;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if not coalesce((select s.minute_edit_enabled from public.overtime_settings s where s.id = true), false) then
    raise exception using errcode = '23514', message = 'minute_edit_disabled';
  end if;
  if p_job_id is null or p_evidence_id is null or p_storage_path is null then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
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

  perform pg_advisory_xact_lock(hashtextextended(target.user_id::text, 0));

  -- Retry after a lost response: this proof is already recorded.
  select e.id into existing_id from public.overtime_evidence e where e.id = p_evidence_id;
  if existing_id is not null then
    return existing_id;
  end if;

  if p_storage_path not like target.user_id::text || '/' || target.job_date::text || '/%' then
    raise exception using errcode = '23514', message = 'invalid_evidence_path';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'overtime-evidence' and o.name = p_storage_path
       and (o.owner_id = actor_id::text or o.owner = actor_id)
  ) then
    raise exception using errcode = 'P0002', message = 'evidence_file_missing';
  end if;

  select coalesce(s.evidence_retention_days, 30) into retention from public.overtime_settings s where s.id = true;
  retention := least(365, greatest(1, coalesce(retention, 30)));
  insert into public.overtime_evidence (id, job_id, user_id, job_date, storage_path, daily_minutes, expires_at, ocr_status)
  values (p_evidence_id, target.id, target.user_id, target.job_date, p_storage_path, minutes, now() + make_interval(days => retention), 'pending');

  update public.jobs j set overtime_evidence_captured = true where j.id = target.id and j.overtime_evidence_captured is not true;

  select p.full_name into person_name from public.profiles p where p.id = target.user_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'overtime_proof_added_by_owner', target.user_id, person_name, target.id,
          jsonb_build_object('job_date', target.job_date, 'ot', target.ot, 'evidence_id', p_evidence_id, 'reason', clean_reason));
  return p_evidence_id;
end;
$function$;

revoke all on function public.add_overtime_proof_for_employee(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.add_overtime_proof_for_employee(uuid, uuid, text, integer, text) to authenticated;
