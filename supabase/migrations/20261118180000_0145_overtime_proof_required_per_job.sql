-- 0145: the database refuses to SUBMIT a work order past the day's line without its own overtime proof (V2.4.272, Phase 11).
--
-- Owner decision 2026-11-17: every work order that goes past the 8 h line (10 h with « 4 jours de 10 h ») must carry its own
-- screenshot of the overtime request form — 2 work orders past the line, 2 proofs required. Since 0144 each proof stays on the
-- job it was added for, so the rule can be checked job by job.
--
-- validate_job_submission_contract (last body: 0137 + the owner_submit skip) is recreated; ONLY the overtime-proof block changes:
--   * work dates from 2026-11-17: the job being submitted is past the line when the paid minutes of the jobs that come before it
--     (Départ order, then id — the same order as the first-trip-unpaid rule and as overtimeLineJobIds in the app) plus its own,
--     less the day's unpaid first trip, pass the line; it then needs a row in overtime_evidence for THIS job (the capture flag
--     is not trusted: save_own_job accepts a flag claimed on the strength of another job's proof);
--   * earlier work dates keep the day-level rule (one proof anywhere on the day), so nothing already entered is blocked;
--   * office staff and the owner's emergency submission (sparklog.owner_submit) stay exempt, as before.
-- Only the transition to « submitted » is checked, never a draft. The message is still overtime_evidence_required.
create or replace function public.validate_job_submission_contract()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  duration_minutes integer;
  other_minutes integer;
  before_minutes integer := 0;
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

  -- Minutes of the day's jobs that come BEFORE this one (Départ, then id): the proof rule is per work order from 2026-11-17.
  if new.job_date >= date '2026-11-17' then
    select coalesce(sum(case
      when j.started_at is not null and j.ended_at is not null
        then extract(epoch from (j.ended_at - j.started_at))::integer / 60
      when j.depart is not null and j.fin is not null
        then (extract(epoch from (j.fin - j.depart))::integer / 60 + 1440) % 1440
      else 0
    end), 0)::integer
    into before_minutes
    from public.jobs j
    where j.user_id = new.user_id
      and j.job_date = new.job_date
      and j.id <> new.id
      and j.status in ('saved', 'updated', 'submitted', 'approved')
      and (coalesce(left(j.depart::text, 5), '') collate "C", j.id::text collate "C")
        < (coalesce(left(new.depart::text, 5), '') collate "C", new.id::text collate "C");
  end if;

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

  if not owner_submit and not coalesce(is_office_employee, false) then
    if new.job_date >= date '2026-11-17' then
      -- One proof PER work order past the line: this job crosses it, or follows one that did, and has no proof of its own.
      if before_minutes + duration_minutes - coalesce(unpaid_trip_minutes, 0) > daily_regular_minutes
         and not exists (select 1 from public.overtime_evidence e where e.job_id = new.id) then
        raise exception using errcode = '23514', message = 'overtime_evidence_required';
      end if;
    elsif duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > daily_regular_minutes
          and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
      raise exception using errcode = '23514', message = 'overtime_evidence_required';
    end if;
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
