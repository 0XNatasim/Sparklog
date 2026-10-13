-- 0084: S-2 (NAS never read directly from the browser) and S-3b (overtime proof recorded
-- atomically with its job and its manager notification).
--
-- S-2 — employee_sensitive becomes RPC-only. Before this, an owner session could run
-- `select * from employee_sensitive` and bulk-read every NAS without any trace (the CCQ
-- export did exactly that on page load). Now:
--   * no table policy and no table grant for anon/authenticated: the browser cannot
--     select, insert or update the vault (service_role and security-definer functions
--     are unaffected);
--   * reveal_nas(target)            — one NAS, owner only, audited (unchanged);
--   * set_nas(target, nas)          — write/clear one NAS, owner only, 9 digits, audited
--                                     (the value is never written to the audit log);
--   * nas_presence()                — who has a NAS on file (ids only, no value);
--   * export_ccq_nas(ids, reason)   — the CCQ monthly export: owner only, a written reason
--                                     (≥ 10 characters) is required, one audit row per
--                                     export with the reason and the count, at most 5
--                                     exports per hour and 500 employees per export.
--
-- S-3b — save_own_job_with_overtime_evidence() saves the job, records the proof row and
-- the manager notification in ONE transaction, after checking that the uploaded file
-- exists in the employee's own folder. Before, the job was saved (and submitted) flagged
-- "proof captured" first, then the proof row and the notification were separate requests:
-- a failure in between left a submitted job claiming a proof that was never recorded,
-- or a proof the manager was never told about. save_own_job also stops trusting the
-- client flag: a job can only be flagged when a proof exists for that day (or the job
-- already carried the flag for that same day, e.g. after the proof's retention purge).

-- ── S-2: NAS vault ──────────────────────────────────────────────────────────────────
drop policy if exists "sensitive: privileged read" on public.employee_sensitive;
drop policy if exists "sensitive: privileged insert" on public.employee_sensitive;
drop policy if exists "sensitive: privileged update" on public.employee_sensitive;
revoke all on public.employee_sensitive from anon, authenticated;
alter table public.employee_sensitive enable row level security;

create or replace function public.set_nas(target uuid, p_nas text)
returns boolean
language plpgsql security definer set search_path to 'public' as $function$
declare
  clean text := nullif(regexp_replace(coalesce(p_nas, ''), '\D', '', 'g'), '');
begin
  if not public.is_privileged() then
    raise exception using errcode = '42501', message = 'Not authorized to edit sensitive data';
  end if;
  if target is null or not exists (select 1 from public.profiles p where p.id = target) then
    raise exception using errcode = 'P0002', message = 'employee_not_found';
  end if;
  if clean is not null and length(clean) <> 9 then
    raise exception using errcode = '23514', message = 'invalid_nas';
  end if;

  insert into public.employee_sensitive as s (user_id, nas, updated_at)
  values (target, clean, now())
  on conflict (user_id) do update set nas = excluded.nas, updated_at = excluded.updated_at;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, details)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'nas_update',
          target, (select full_name from public.profiles where id = target),
          jsonb_build_object('cleared', clean is null));
  return clean is not null;
end;
$function$;

create or replace function public.nas_presence()
returns table(user_id uuid)
language sql stable security definer set search_path to 'public' as $function$
  select s.user_id from public.employee_sensitive s
  where s.nas is not null and public.is_privileged();
$function$;

create or replace function public.export_ccq_nas(p_user_ids uuid[], p_reason text)
returns table(user_id uuid, nas text)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  caller_id uuid := auth.uid();
  reason text := btrim(coalesce(p_reason, ''));
  recent integer;
  found integer;
begin
  if not public.is_privileged() then
    raise exception using errcode = '42501', message = 'Not authorized to view sensitive data';
  end if;
  if length(reason) < 10 then
    raise exception using errcode = '23514', message = 'export_reason_required';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;
  if cardinality(p_user_ids) > 500 then
    raise exception using errcode = '23514', message = 'too_many_employees';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nas_bulk_export:' || caller_id::text, 0));
  select count(*) into recent from public.audit_log a
   where a.actor_id = caller_id and a.action = 'nas_bulk_export'
     and a.created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception using errcode = 'P0001', message = 'nas_export_rate_limited';
  end if;

  select count(*) into found from public.employee_sensitive s
   where s.user_id = any(p_user_ids) and s.nas is not null;

  insert into public.audit_log (actor_id, actor_name, action, details)
  values (caller_id, (select full_name from public.profiles where id = caller_id), 'nas_bulk_export',
          jsonb_build_object('reason', left(reason, 500), 'requested', cardinality(p_user_ids), 'returned', found,
                             'purpose', 'ccq_monthly_report'));

  return query
    select s.user_id, s.nas from public.employee_sensitive s
     where s.user_id = any(p_user_ids) and s.nas is not null;
end;
$function$;

revoke all on function public.set_nas(uuid, text) from public, anon;
revoke all on function public.nas_presence() from public, anon;
revoke all on function public.export_ccq_nas(uuid[], text) from public, anon;
grant execute on function public.set_nas(uuid, text) to authenticated;
grant execute on function public.nas_presence() to authenticated;
grant execute on function public.export_ccq_nas(uuid[], text) to authenticated;

-- ── S-3b: save_own_job no longer trusts a client "proof captured" flag ─────────────
create or replace function public.save_own_job(p_job_id uuid, p_new_job_id uuid, p_submission_key uuid, p_submit boolean, p_job_date date, p_ot text, p_depart time without time zone, p_arrivee time without time zone, p_fin time without time zone, p_km_total numeric, p_km_aller numeric, p_return_time_minutes integer, p_km_retour numeric, p_overtime_evidence_captured boolean, p_parking_receipt_captured boolean, p_confirm_manager_entry boolean DEFAULT false)
 RETURNS TABLE(id uuid, status text, locked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_id uuid := auth.uid();
  current_job public.jobs%rowtype;
  result_job public.jobs%rowtype;
  confirming boolean := false;
  day_has_evidence boolean;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.is_not_paused() then
    raise exception using errcode = '42501', message = 'job_write_not_allowed';
  end if;
  if p_job_date is null then
    raise exception using errcode = '23514', message = 'job_date_required';
  end if;

  -- The flag is only honoured when a proof is actually recorded for that day.
  day_has_evidence := exists (
    select 1 from public.overtime_evidence e where e.user_id = caller_id and e.job_date = p_job_date
  );

  if p_job_id is null then
    if p_submission_key is null then
      raise exception using errcode = '23514', message = 'submission_key_required';
    end if;

    -- Look up the key first: BEFORE INSERT triggers run before ON CONFLICT and would flag the retry as an overlap.
    perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));
    select * into result_job
      from public.jobs j
     where j.user_id = caller_id and j.submission_key = p_submission_key;

    if result_job.id is null then
      insert into public.jobs (
        id, user_id, submission_key, job_date, ot, depart, arrivee, fin,
        km_total, km_aller, return_time_minutes, km_retour,
        overtime_evidence_captured, parking_receipt_captured, status, locked
      ) values (
        coalesce(p_new_job_id, gen_random_uuid()), caller_id, p_submission_key,
        p_job_date, p_ot, p_depart, p_arrivee, p_fin,
        coalesce(p_km_total, 0), coalesce(p_km_aller, 0),
        coalesce(p_return_time_minutes, 0), coalesce(p_km_retour, 0),
        coalesce(p_overtime_evidence_captured, false) and day_has_evidence,
        coalesce(p_parking_receipt_captured, false),
        case when p_submit then 'submitted' else 'saved' end,
        p_submit
      )
      on conflict (user_id, submission_key) do nothing
      returning * into result_job;

      if result_job.id is null then
        select * into result_job
          from public.jobs j
         where j.user_id = caller_id and j.submission_key = p_submission_key;
      end if;
    end if;
  else
    select * into current_job
      from public.jobs j
     where j.id = p_job_id and j.user_id = caller_id
     for update;

    if current_job.id is null then
      raise exception using errcode = 'P0002', message = 'job_not_found';
    end if;

    -- A retry after a successful submit is a successful no-op.  No submitted fact
    -- can be changed through this RPC.
    if current_job.status = 'submitted' and current_job.locked and p_submit then
      result_job := current_job;
    else
      if current_job.locked or current_job.status not in ('saved', 'updated') then
        raise exception using errcode = '55000', message = 'job_not_editable';
      end if;

      -- A job created by an owner must be explicitly confirmed by the employee first.
      if p_submit and current_job.manager_entry_at is not null
         and current_job.employee_confirmed_at is null then
        if not coalesce(p_confirm_manager_entry, false) then
          raise exception using errcode = '55000', message = 'manager_entry_confirmation_required';
        end if;
        confirming := true;
      end if;

      update public.jobs j
         set job_date = p_job_date,
             ot = p_ot,
             depart = p_depart,
             arrivee = p_arrivee,
             fin = p_fin,
             km_total = coalesce(p_km_total, 0),
             km_aller = coalesce(p_km_aller, 0),
             return_time_minutes = coalesce(p_return_time_minutes, 0),
             km_retour = coalesce(p_km_retour, 0),
             overtime_evidence_captured = coalesce(p_overtime_evidence_captured, false)
               and (day_has_evidence
                    or (current_job.overtime_evidence_captured and current_job.job_date = p_job_date)),
             parking_receipt_captured = coalesce(p_parking_receipt_captured, false),
             status = case when p_submit then 'submitted' else 'updated' end,
             locked = p_submit,
             employee_confirmed_at = case when confirming then now() else j.employee_confirmed_at end
       where j.id = current_job.id
       returning * into result_job;

      if confirming then
        insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
        values (caller_id, public.audit_actor_name(caller_id), 'manager_entry_confirmed', caller_id,
                public.audit_actor_name(caller_id), result_job.id,
                jsonb_build_object('job_date', result_job.job_date, 'ot', result_job.ot,
                                   'created_by', current_job.manager_entry_by_name));
      end if;
    end if;
  end if;

  return query select result_job.id, result_job.status, result_job.locked;
end;
$function$;

-- ── S-3b: job + proof + notification in one transaction ─────────────────────────────
-- Proof rows are written only by the function below (which checks the file); employees
-- lose the direct insert. Managers keep their read policy.
drop policy if exists "overtime evidence: owner insert" on public.overtime_evidence;

create or replace function public.save_own_job_with_overtime_evidence(
  p_job_id uuid, p_new_job_id uuid, p_submission_key uuid, p_submit boolean, p_job_date date,
  p_ot text, p_depart time without time zone, p_arrivee time without time zone, p_fin time without time zone,
  p_km_total numeric, p_km_aller numeric, p_return_time_minutes integer, p_km_retour numeric,
  p_parking_receipt_captured boolean,
  p_evidence_id uuid, p_storage_path text, p_daily_minutes integer,
  p_confirm_manager_entry boolean DEFAULT false)
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

revoke all on function public.save_own_job_with_overtime_evidence(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, uuid, text, integer, boolean) from public, anon;
grant execute on function public.save_own_job_with_overtime_evidence(uuid, uuid, uuid, boolean, date, text, time, time, time, numeric, numeric, integer, numeric, boolean, uuid, text, integer, boolean) to authenticated;
