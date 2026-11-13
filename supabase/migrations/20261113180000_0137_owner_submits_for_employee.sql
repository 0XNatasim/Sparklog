-- 0137: the owner submits a work sheet for an employee (V2.4.254).
--
-- Emergency timesheet (0075): the owner created a draft that the employee had to confirm and submit. An employee who
-- left (or is being let go) never will. Now the owner can:
--   * create the sheet already submitted (create_job_for_employee, new p_submit => true): no message to the employee,
--     no day unlock, the sheet goes straight to the managers' review;
--   * submit a draft the employee has not confirmed (submit_manager_entry_for_employee).
-- The overtime proof and the end-of-shift inventory screenshots can only come from the employee, so
-- validate_job_submission_contract skips those two checks when the transaction carries sparklog.owner_submit = 'on'
-- (set by the two security-definer functions only; a browser cannot set a database setting). Interval, overlap and
-- kilometres are still checked. employee_confirmed_at stays null: the employee never confirmed it. Audited:
-- job_created_submitted_by_owner / job_submitted_by_owner. An employee already paused (left the company) can still have a
-- sheet submitted this way, but not a draft.

drop function if exists public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint);

create or replace function public.create_job_for_employee(
  p_employee_id uuid,
  p_submission_key uuid,
  p_job_date date,
  p_ot text,
  p_depart time,
  p_arrivee time,
  p_fin time,
  p_km_aller numeric,
  p_note text,
  p_depart_fold smallint default null,
  p_fin_fold smallint default null,
  p_submit boolean default false
)
returns table (id uuid, broadcast_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  target public.profiles%rowtype;
  existing public.jobs%rowtype;
  new_job public.jobs%rowtype;
  new_broadcast uuid;
  today_local date := (timezone('America/Toronto', now()))::date;
  clean_ot text := btrim(coalesce(p_ot, ''));
  clean_note text := btrim(coalesce(p_note, ''));
  duration_minutes integer;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  if p_employee_id is null or p_submission_key is null or p_job_date is null then
    raise exception using errcode = '23514', message = 'manager_entry_missing_field';
  end if;
  if clean_ot = '' then
    raise exception using errcode = '23514', message = 'manager_entry_ot_required';
  end if;
  if char_length(clean_note) < 3 or char_length(clean_note) > 500 then
    raise exception using errcode = '23514', message = 'manager_entry_note_required';
  end if;
  if p_job_date > today_local or p_job_date < today_local - 31 then
    raise exception using errcode = '23514', message = 'manager_entry_date_out_of_window';
  end if;
  if p_depart is null or p_fin is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := (extract(epoch from (p_fin - p_depart))::integer / 60);
  if duration_minutes <= 0 then duration_minutes := duration_minutes + 1440; end if;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  if (p_depart_fold is not null and p_depart_fold not in (1, 2))
     or (p_fin_fold is not null and p_fin_fold not in (1, 2)) then
    raise exception using errcode = '23514', message = 'invalid_dst_choice';
  end if;
  if p_km_aller is not null and p_km_aller < 0 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;

  select * into target from public.profiles p where p.id = p_employee_id;
  if target.id is null
     or target.role not in ('employee', 'foreman', 'admin', 'subcontractor_1')
     or (target.is_paused and not coalesce(p_submit, false)) then
    raise exception using errcode = 'P0002', message = 'manager_entry_employee_not_eligible';
  end if;

  -- Same per-employee lock as the submission validator and save_own_job.
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));

  -- A retry (lost response, double click) resolves to the committed row: one job, one
  -- audit event, one notification.
  select * into existing from public.jobs j
   where j.user_id = p_employee_id and j.submission_key = p_submission_key;
  if existing.id is not null then
    if existing.manager_entry_at is null then
      raise exception using errcode = '23505', message = 'submission_key_conflict';
    end if;
    return query select existing.id, null::uuid;
    return;
  end if;

  actor_name := public.audit_actor_name(actor_id);
  -- Submitted by the owner for the employee: the overtime proof and inventory screenshots can only come from the employee,
  -- so the submission validator skips them for this transaction (see validate_job_submission_contract).
  if coalesce(p_submit, false) then perform set_config('sparklog.owner_submit', 'on', true); end if;

  insert into public.jobs (
    user_id, submission_key, job_date, ot, depart, arrivee, fin, depart_fold, fin_fold,
    km_total, km_aller, return_time_minutes, km_retour,
    status, locked,
    manager_entry_at, manager_entry_by, manager_entry_by_name, manager_entry_note
  ) values (
    p_employee_id, p_submission_key, p_job_date, clean_ot, p_depart, p_arrivee, p_fin, p_depart_fold, p_fin_fold,
    coalesce(p_km_aller, 0), coalesce(p_km_aller, 0), 0, 0,
    case when coalesce(p_submit, false) then 'submitted' else 'saved' end, false,
    now(), actor_id, actor_name, clean_note
  )
  returning * into new_job;
  perform set_config('sparklog.owner_submit', 'off', true);

  if not coalesce(p_submit, false) then
    -- The employee must be able to submit a past-dated job even after the daily entry
    -- deadline (enforce_job_entry_window): open that day for 14 days. A null (no expiry)
    -- unlock is never shortened.
    insert into public.job_entry_unlocks (user_id, job_date, unlocked_until, reason, created_by)
    values (p_employee_id, p_job_date, now() + interval '14 days', 'manager_entry', actor_id)
    on conflict (user_id, job_date) do update
      set unlocked_until = case
        when public.job_entry_unlocks.unlocked_until is null then null
        else greatest(public.job_entry_unlocks.unlocked_until, excluded.unlocked_until)
      end;

    insert into public.manager_broadcasts (sender_id, body, audience)
    values (
      actor_id,
      'Une feuille de temps a été créée pour vous (' || to_char(p_job_date, 'YYYY-MM-DD')
        || '). Ouvrez Historique, vérifiez-la puis validez-la pour la soumettre.'
        || E'\n\n'
        || 'A timesheet was created for you (' || to_char(p_job_date, 'YYYY-MM-DD')
        || '). Open History, review it, then confirm it to submit.',
      'selected'
    )
    returning manager_broadcasts.id into new_broadcast;
    insert into public.broadcast_recipients (broadcast_id, employee_id)
    values (new_broadcast, p_employee_id);
  end if;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, case when coalesce(p_submit, false) then 'job_created_submitted_by_owner' else 'job_created_by_owner' end, p_employee_id, target.full_name, new_job.id,
          jsonb_build_object('job_date', p_job_date, 'ot', clean_ot, 'depart', p_depart,
                             'arrivee', p_arrivee, 'fin', p_fin, 'km', coalesce(p_km_aller, 0),
                             'note', clean_note, 'submitted', coalesce(p_submit, false), 'depart_fold', new_job.depart_fold, 'fin_fold', new_job.fin_fold));

  return query select new_job.id, new_broadcast;
end;
$function$;


revoke all on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint, boolean)
  from public, anon;
grant execute on function public.create_job_for_employee(uuid, uuid, date, text, time, time, time, numeric, text, smallint, smallint, boolean)
  to authenticated;

-- The owner submits an existing draft that the employee has not confirmed.
create or replace function public.submit_manager_entry_for_employee(p_job_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  current_job public.jobs%rowtype;
  employee_name text;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception using errcode = '42501', message = 'owner_role_required';
  end if;
  select * into current_job from public.jobs j where j.id = p_job_id for update;
  if current_job.id is null or current_job.manager_entry_at is null then
    raise exception using errcode = 'P0002', message = 'manager_entry_not_found';
  end if;
  if current_job.status = 'submitted' then
    return query select current_job.id;
    return;
  end if;
  if current_job.status not in ('saved', 'updated') or current_job.locked then
    raise exception using errcode = '23514', message = 'manager_entry_not_submittable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_job.user_id::text, 0));
  actor_name := public.audit_actor_name(actor_id);
  perform set_config('sparklog.owner_submit', 'on', true);
  update public.jobs j set status = 'submitted' where j.id = current_job.id;
  perform set_config('sparklog.owner_submit', 'off', true);
  select p.full_name into employee_name from public.profiles p where p.id = current_job.user_id;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, actor_name, 'job_submitted_by_owner', current_job.user_id, employee_name, current_job.id,
          jsonb_build_object('job_date', current_job.job_date, 'ot', current_job.ot));
  return query select current_job.id;
end;
$function$;

revoke all on function public.submit_manager_entry_for_employee(uuid) from public, anon;
grant execute on function public.submit_manager_entry_for_employee(uuid) to authenticated;

create or replace function public.validate_job_submission_contract()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  duration_minutes integer;
  other_minutes integer;
  day_has_evidence boolean;
  is_office_employee boolean;
  daily_regular_minutes integer := 480;
  inventory_enabled boolean;
  first_trip_unpaid boolean;
  unpaid_trip_minutes integer := 0;
  -- The owner submits for the employee (create_job_for_employee / submit_manager_entry_for_employee): the overtime proof and
  -- the inventory screenshots can only come from the employee, so only those two checks are skipped; interval, overlap and
  -- kilometres still apply. The flag is set inside the security-definer functions for their transaction only.
  owner_submit boolean := coalesce(current_setting('sparklog.owner_submit', true), '') = 'on';
begin
  if new.status <> 'submitted' then return new; end if;
  if tg_op = 'UPDATE' and old.status not in ('saved', 'updated') then return new; end if;
  if new.started_at is null or new.ended_at is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := extract(epoch from (new.ended_at - new.started_at))::integer / 60;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select coalesce(p.role = 'admin', false), coalesce(p.inventory_screenshots_enabled, false),
         coalesce(p.first_trip_unpaid, false)
  into is_office_employee, inventory_enabled, first_trip_unpaid
  from public.profiles p where p.id = new.user_id;
  -- 4 days of 10 h (profiles.ten_hour_days, engine 2.9.0): overtime, hence its proof, starts after 10 h.
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.ten_hour_days
                and p.role not in ('foreman', 'subcontractor_1')) then
    daily_regular_minutes := 600;
  end if;
  select
    coalesce(sum(case
      when j.started_at is not null and j.ended_at is not null
        then extract(epoch from (j.ended_at - j.started_at))::integer / 60
      when j.depart is not null and j.fin is not null
        then (extract(epoch from (j.fin - j.depart))::integer / 60 + 1440) % 1440
      else 0
    end), 0)::integer,
    coalesce(bool_or(j.overtime_evidence_captured), false)
  into other_minutes, day_has_evidence
  from public.jobs j
  where j.user_id = new.user_id
    and j.job_date = new.job_date
    and j.id <> new.id
    and j.status in ('saved', 'updated', 'submitted', 'approved');

  -- "First trip unpaid" employees reach the 8 h threshold on PAID time: the day's first
  -- Départ→Arrivée trip (earliest Départ, then id; clamped to that job's Départ→Fin span;
  -- none when the first job has no Arrivée, and none when that first job is 65 km or more from
  -- 2026-10-11: owner decision 2026-10-30, engine 2.7.0) is not paid. Twin of
  -- dayFirstTripUnpaidMinutes in supabase/functions/_shared/payroll_engine.js.
  if coalesce(first_trip_unpaid, false) then
    select case
             when d.depart is null or d.arrivee is null or d.fin is null then 0
             when new.job_date >= date '2026-10-11' and d.km >= 65 then 0
             else least(
               ((extract(epoch from (d.arrivee - d.depart))::integer / 60) + 1440) % 1440,
               ((extract(epoch from (d.fin - d.depart))::integer / 60) + 1440) % 1440
             )
           end
      into unpaid_trip_minutes
      from (
        select x.id, x.depart, x.arrivee, x.fin, x.km
          from (
            select j.id, j.depart, j.arrivee, j.fin,
                   greatest(coalesce(j.km_total, 0), coalesce(j.km_aller, 0) + coalesce(j.km_retour, 0)) as km
              from public.jobs j
             where j.user_id = new.user_id
               and j.job_date = new.job_date
               and j.id <> new.id
               and j.status in ('saved', 'updated', 'submitted', 'approved')
            union all
            select new.id, new.depart, new.arrivee, new.fin,
                   greatest(coalesce(new.km_total, 0), coalesce(new.km_aller, 0) + coalesce(new.km_retour, 0))
          ) x
         order by coalesce(left(x.depart::text, 5), '') collate "C", x.id::text collate "C"
         limit 1
      ) d;
  end if;

  if not owner_submit
     and not coalesce(is_office_employee, false)
     and duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > daily_regular_minutes
     and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- End-of-shift inventory: the day must carry at least one Field Service inventory
  -- screenshot (office staff are exempt, and days before the rollout date are grandfathered).
  -- Two captures often show the whole list; completeness is the list's line count against the
  -- app's own "N de N" total, checked on the manager's Inventory page, not the number of photos.
  -- The defective-products picture (slot 4, 0097) does not count as an inventory screenshot.
  if not owner_submit
     and not coalesce(is_office_employee, false)
     and coalesce(inventory_enabled, false)
     and new.job_date >= date '2026-10-08'
     and not exists (select 1 from public.inventory_screenshots s
          where s.user_id = new.user_id and s.job_date = new.job_date and s.slot between 1 and 3) then
    raise exception using errcode = '23514', message = 'inventory_screenshots_required';
  end if;

  if exists (
    select 1 from public.jobs j
    where j.user_id = new.user_id
      and j.id <> new.id
      and j.status in ('submitted', 'approved')
      and j.started_at is not null and j.ended_at is not null
      and tstzrange(j.started_at, j.ended_at, '[)')
          && tstzrange(new.started_at, new.ended_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'overlapping_job_interval';
  end if;
  if new.return_time_minutes > duration_minutes then
    raise exception using errcode = '23514', message = 'return_time_exceeds_job_interval';
  end if;
  if new.km_total is null or new.km_aller is null or new.km_retour is null
     or new.km_total < 0 or new.km_aller < 0 or new.km_retour < 0
     or new.km_retour > new.km_total
     or abs((new.km_aller + new.km_retour) - new.km_total) > 0.001 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_job_submission_contract() from public, anon, authenticated;
