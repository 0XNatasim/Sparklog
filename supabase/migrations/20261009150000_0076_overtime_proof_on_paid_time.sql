-- 0076: the 8-hour overtime-proof rule counts PAID time for employees with the
-- "first trip unpaid" option (profiles.first_trip_unpaid, migration 0070).
--
-- The overtime screenshot is required when a day exceeds 8 h. For these employees the
-- day's first Départ→Arrivée trip is not paid, so a day of 8 h 29 with a 30-minute unpaid
-- trip pays 7 h 59 and creates no overtime: the proof is no longer demanded. Everyone
-- else keeps the gross rule. The body is the 0072 validator; the only changes are the
-- first_trip_unpaid lookup and the unpaid-trip deduction before the 480-minute test.
-- (Evidence reconciliation, meal eligibility and the payroll itself are untouched.)

create or replace function public.validate_job_submission_contract()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  duration_minutes integer;
  other_minutes integer;
  day_has_evidence boolean;
  is_office_employee boolean;
  inventory_enabled boolean;
  first_trip_unpaid boolean;
  unpaid_trip_minutes integer := 0;
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
  -- none when the first job has no Arrivée) is not paid. Twin of dayFirstTripUnpaidMinutes
  -- in supabase/functions/_shared/payroll_engine.js.
  if coalesce(first_trip_unpaid, false) then
    select case
             when d.depart is null or d.arrivee is null or d.fin is null then 0
             else least(
               ((extract(epoch from (d.arrivee - d.depart))::integer / 60) + 1440) % 1440,
               ((extract(epoch from (d.fin - d.depart))::integer / 60) + 1440) % 1440
             )
           end
      into unpaid_trip_minutes
      from (
        select x.id, x.depart, x.arrivee, x.fin
          from (
            select j.id, j.depart, j.arrivee, j.fin
              from public.jobs j
             where j.user_id = new.user_id
               and j.job_date = new.job_date
               and j.id <> new.id
               and j.status in ('saved', 'updated', 'submitted', 'approved')
            union all
            select new.id, new.depart, new.arrivee, new.fin
          ) x
         order by coalesce(left(x.depart::text, 5), '') collate "C", x.id::text collate "C"
         limit 1
      ) d;
  end if;

  if not coalesce(is_office_employee, false)
     and duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > 480
     and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- End-of-shift inventory: the day must carry all three Field Service inventory
  -- screenshots (office staff are exempt, and days before the rollout date are grandfathered).
  if not coalesce(is_office_employee, false)
     and coalesce(inventory_enabled, false)
     and new.job_date >= date '2026-10-08'
     and (select count(distinct s.slot) from public.inventory_screenshots s
          where s.user_id = new.user_id and s.job_date = new.job_date) < 3 then
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
