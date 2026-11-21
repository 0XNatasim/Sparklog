-- 0152: the owner can correct the Départ / Fin of a work sheet (V2.4.296).
--
-- Why: an employee who started at 6:57 and finished at 15:00 has 3 minutes of overtime past the 8 h line, hence a proof form to
-- fill for 3 minutes; they would rather not submit the sheet at all. The owner can now move the times of a sheet herself.
--
-- A very special switch, OFF by default: overtime_settings.minute_edit_enabled, turned on / off only by the owner through
-- set_minute_edit_enabled (audited). While it is on, the app shows a red banner on every management page.
--
-- adjust_job_times_for_employee(job, depart, fin, reason): owner only (is_privileged: manager role + 2FA), switch on, a written
-- reason (3-500 characters), sheets saved / updated / submitted only (never approved or already exported to the sheet).
-- No limit on the size of the change (owner decision 2026-11-20), but the result must still be a valid sheet: 0 < duration <= 16 h,
-- no overlap with the employee's other submitted / approved sheets, return time within the sheet. The change is audited with the
-- values before and after. The overtime proof rows follow the existing rule (reconcile_overtime_evidence: a day back under the
-- line no longer needs its proof). Replayable.

alter table public.overtime_settings
  add column if not exists minute_edit_enabled boolean not null default false;

create or replace function public.set_minute_edit_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  actor_name := public.audit_actor_name(actor_id);
  update public.overtime_settings set minute_edit_enabled = coalesce(p_enabled, false), updated_at = now() where id = true;
  insert into public.audit_log (actor_id, actor_name, action, details)
  values (actor_id, actor_name, case when coalesce(p_enabled, false) then 'minute_edit_enabled' else 'minute_edit_disabled' end, '{}'::jsonb);
  return coalesce(p_enabled, false);
end;
$function$;

revoke all on function public.set_minute_edit_enabled(boolean) from public, anon;
grant execute on function public.set_minute_edit_enabled(boolean) to authenticated;

create or replace function public.adjust_job_times_for_employee(
  p_job_id uuid,
  p_depart time,
  p_fin time,
  p_reason text
)
returns public.jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  clean_reason text := btrim(coalesce(p_reason, ''));
  target public.jobs%rowtype;
  before_row public.jobs%rowtype;
  after_row public.jobs%rowtype;
  duration_minutes integer;
  person_name text;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if not coalesce((select s.minute_edit_enabled from public.overtime_settings s where s.id = true), false) then
    raise exception using errcode = '23514', message = 'minute_edit_disabled';
  end if;
  if p_job_id is null or p_depart is null or p_fin is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
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
  before_row := target;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(target.user_id::text, 0));

  duration_minutes := extract(epoch from (p_fin - p_depart))::integer / 60;
  if duration_minutes <= 0 then duration_minutes := duration_minutes + 1440; end if;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  if coalesce(target.return_time_minutes, 0) > duration_minutes then
    raise exception using errcode = '23514', message = 'return_time_exceeds_job_interval';
  end if;

  update public.jobs set depart = p_depart, fin = p_fin where id = p_job_id returning * into after_row;

  -- started_at / ended_at are resolved by the trigger from the new times: no overlap with the employee's other sheets.
  if after_row.started_at is null or after_row.ended_at is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  if exists (
    select 1 from public.jobs j
    where j.user_id = after_row.user_id
      and j.id <> after_row.id
      and j.status in ('submitted', 'approved')
      and j.started_at is not null and j.ended_at is not null
      and tstzrange(j.started_at, j.ended_at, '[)') && tstzrange(after_row.started_at, after_row.ended_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'overlapping_job_interval';
  end if;

  actor_name := public.audit_actor_name(actor_id);
  select p.full_name into person_name from public.profiles p where p.id = after_row.user_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_times_adjusted_by_owner', after_row.user_id, person_name, after_row.id,
          jsonb_build_object('job_date', after_row.job_date, 'ot', after_row.ot, 'status', after_row.status,
                             'depart_before', before_row.depart, 'fin_before', before_row.fin,
                             'depart_after', after_row.depart, 'fin_after', after_row.fin,
                             'reason', clean_reason));
  return after_row;
end;
$function$;

revoke all on function public.adjust_job_times_for_employee(uuid, time, time, text) from public, anon;
grant execute on function public.adjust_job_times_for_employee(uuid, time, time, text) to authenticated;
