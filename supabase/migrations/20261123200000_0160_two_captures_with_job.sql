-- 0160: two captures with the job, in one transaction (V2.4.322).
--
-- The overtime form of November 2026 has two answers on two screens (« Durée réelle du temps supplémentaire » and « Durée du
-- retour »), so the employee gives TWO screenshots at the proof step instead of adding the second one afterwards from the clock in
-- History (a submitted job can no longer take a new proof). save_own_job_with_overtime_evidence (0084) gets two optional
-- arguments, p_evidence_id_2 and p_storage_path_2: the second file is checked like the first (own folder for that day, present in
-- the bucket), recorded and notified in the same transaction, BEFORE the job is submitted. Without them the function behaves exactly
-- as before (an old app version keeps working). A retry after a lost response finds the first proof and returns the job as it
-- stands (both proofs were written together). The old 18-argument signature is dropped first: two overloads that differ only by
-- default arguments would make every call ambiguous. Replayable.

drop function if exists public.save_own_job_with_overtime_evidence(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, uuid, text, integer, boolean);

create or replace function public.save_own_job_with_overtime_evidence(
  p_job_id uuid, p_new_job_id uuid, p_submission_key uuid, p_submit boolean, p_job_date date,
  p_ot text, p_depart time without time zone, p_arrivee time without time zone, p_fin time without time zone,
  p_km_total numeric, p_km_aller numeric, p_return_time_minutes integer, p_km_retour numeric,
  p_parking_receipt_captured boolean,
  p_evidence_id uuid, p_storage_path text, p_daily_minutes integer,
  p_confirm_manager_entry boolean DEFAULT false,
  p_evidence_id_2 uuid DEFAULT null, p_storage_path_2 text DEFAULT null)
returns table(id uuid, status text, locked boolean, evidence_id uuid)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  caller_id uuid := auth.uid();
  existing public.overtime_evidence%rowtype;
  saved_id uuid;
  saved_status text;
  saved_locked boolean;
  retention integer;
  minutes integer := least(greatest(coalesce(p_daily_minutes, 0), 0), 1440);
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_evidence_id is null or p_storage_path is null or p_job_date is null then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- Retry after a commit whose response was lost: this proof is already recorded, so the
  -- job, the proof and the notification all exist. Return the job as it stands.
  select * into existing from public.overtime_evidence e where e.id = p_evidence_id;
  if existing.id is not null then
    if existing.user_id <> caller_id then
      raise exception using errcode = '42501', message = 'evidence_not_owned';
    end if;
    return query select j.id, j.status, j.locked, existing.id from public.jobs j where j.id = existing.job_id;
    return;
  end if;

  -- The file must already be uploaded, in the caller's own folder for that day.
  if p_storage_path not like caller_id::text || '/' || p_job_date::text || '/%' then
    raise exception using errcode = '23514', message = 'invalid_evidence_path';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'overtime-evidence' and o.name = p_storage_path
       and (o.owner_id = caller_id::text or o.owner = caller_id)
  ) then
    raise exception using errcode = 'P0002', message = 'evidence_file_missing';
  end if;

  -- The optional SECOND proof (the form of November 2026 has two answers, often two captures): same checks, own file.
  if (p_evidence_id_2 is null) <> (p_storage_path_2 is null) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;
  if p_evidence_id_2 is not null then
    if p_evidence_id_2 = p_evidence_id or exists (select 1 from public.overtime_evidence e2 where e2.id = p_evidence_id_2) then
      raise exception using errcode = '23514', message = 'invalid_evidence_path';
    end if;
    if p_storage_path_2 = p_storage_path or p_storage_path_2 not like caller_id::text || '/' || p_job_date::text || '/%' then
      raise exception using errcode = '23514', message = 'invalid_evidence_path';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'overtime-evidence' and o.name = p_storage_path_2
         and (o.owner_id = caller_id::text or o.owner = caller_id)
    ) then
      raise exception using errcode = 'P0002', message = 'evidence_file_missing';
    end if;
  end if;

  -- 1. Save the job as a draft (no proof claimed yet).
  select s.id, s.status, s.locked into saved_id, saved_status, saved_locked
    from public.save_own_job(p_job_id, p_new_job_id, p_submission_key, false, p_job_date, p_ot,
                             p_depart, p_arrivee, p_fin, p_km_total, p_km_aller,
                             p_return_time_minutes, p_km_retour, false,
                             p_parking_receipt_captured, false) s;

  -- 2. Record the proof (its trigger flags the day's last job).
  select coalesce(o.evidence_retention_days, 30) into retention
    from public.overtime_settings o where o.id = true;
  retention := least(365, greatest(1, coalesce(retention, 30)));
  insert into public.overtime_evidence (id, job_id, user_id, job_date, storage_path, daily_minutes, expires_at, ocr_status)
  values (p_evidence_id, saved_id, caller_id, p_job_date, p_storage_path, minutes,
          now() + make_interval(days => retention), 'pending');

  -- 3. Tell the managers (once per proof).
  insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes)
  select 'overtime_evidence', caller_id, saved_id, p_evidence_id, minutes
   where not exists (select 1 from public.manager_notifications n where n.evidence_id = p_evidence_id);

  -- 2b. The second proof, on the same job, in the same transaction.
  if p_evidence_id_2 is not null then
    insert into public.overtime_evidence (id, job_id, user_id, job_date, storage_path, daily_minutes, expires_at, ocr_status)
    values (p_evidence_id_2, saved_id, caller_id, p_job_date, p_storage_path_2, minutes,
            now() + make_interval(days => retention), 'pending');
    insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes)
    select 'overtime_evidence', caller_id, saved_id, p_evidence_id_2, minutes
     where not exists (select 1 from public.manager_notifications n where n.evidence_id = p_evidence_id_2);
  end if;

  -- 4. Submit, now that the proof exists. Any refusal rolls back steps 1-3 too.
  if p_submit then
    select s.id, s.status, s.locked into saved_id, saved_status, saved_locked
      from public.save_own_job(saved_id, null, null, true, p_job_date, p_ot,
                               p_depart, p_arrivee, p_fin, p_km_total, p_km_aller,
                               p_return_time_minutes, p_km_retour, true,
                               p_parking_receipt_captured, p_confirm_manager_entry) s;
  end if;

  return query select saved_id, saved_status, saved_locked, p_evidence_id;
end;
$function$;

revoke all on function public.save_own_job_with_overtime_evidence(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, uuid, text, integer, boolean, uuid, text) from public, anon;
grant execute on function public.save_own_job_with_overtime_evidence(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, uuid, text, integer, boolean, uuid, text) to authenticated;
