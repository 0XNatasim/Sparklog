-- 0125: a long first trip is paid (owner decision 2026-10-30, payroll engine 2.7.0, V2.4.207).
--
-- An employee with the « premier trajet non payé » option (profiles.first_trip_unpaid, 0070) loses the Départ→Arrivée
-- trip of the first job of each day. From now on that trip is paid anyway when the first job of the day is 65 km or
-- more (km_total, or km_aller + km_retour when larger), for the days paid by Sparklog (from 2026-10-11, the first week it
-- pays). Two database twins of dayFirstTripUnpaidMinutes (supabase/functions/_shared/payroll_engine.js) must follow, or
-- the overtime-proof gate and the supper would count unpaid time the payroll now pays:
--   * reconcile_overtime_meal  — supper after 10 h 15 of paid work (body of 0086);
--   * validate_job_submission_contract — the 8 h overtime-proof gate on paid time (body of 0097).
-- Nothing else changes in either function.

create or replace function public.reconcile_overtime_meal(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  daily_work_minutes integer := 0;
  unpaid_trip_minutes integer := 0;
  meal_eligible boolean;
begin
  if p_user is null or p_date is null then return; end if;

  -- Paid span of each job minus its return time (return is never overtime).
  select coalesce(sum(greatest(0, s.span - least(greatest(coalesce(s.return_time_minutes, 0), 0), s.span))), 0)
    into daily_work_minutes
    from (
      select j.return_time_minutes,
             case when j.depart is not null and j.fin is not null then
               (extract(epoch from (j.fin - j.depart)) / 60)::int
                 + case when j.fin < j.depart then 1440 else 0 end
             else 0 end as span
        from public.jobs j
       where j.user_id = p_user and j.job_date = p_date
    ) s;

  -- "First trip unpaid": the day's first job (earliest Départ, then id) loses its
  -- Départ→Arrivée trip, clamped to that job's Départ→Fin span; nothing when it has no
  -- Arrivée, and nothing either when that first job is 65 km or more from 2026-10-11 (owner
  -- decision 2026-10-30, engine 2.7.0). Twin of dayFirstTripUnpaidMinutes in
  -- supabase/functions/_shared/payroll_engine.js.
  if exists (select 1 from public.profiles p where p.id = p_user and p.first_trip_unpaid) then
    select case
             when d.depart is null or d.arrivee is null or d.fin is null then 0
             when p_date >= date '2026-10-11' and d.km >= 65 then 0
             else least(
               ((extract(epoch from (d.arrivee - d.depart))::integer / 60) + 1440) % 1440,
               ((extract(epoch from (d.fin - d.depart))::integer / 60) + 1440) % 1440
             )
           end
      into unpaid_trip_minutes
      from (
        select j.depart, j.arrivee, j.fin,
               greatest(coalesce(j.km_total, 0), coalesce(j.km_aller, 0) + coalesce(j.km_retour, 0)) as km
          from public.jobs j
         where j.user_id = p_user and j.job_date = p_date
         order by coalesce(left(j.depart::text, 5), '') collate "C", j.id::text collate "C"
         limit 1
      ) d;
  end if;

  -- 8 h + 2 h 15 of overtime = 615 minutes of paid work, return excluded.
  meal_eligible := extract(dow from p_date) not in (0, 6)
                   and (daily_work_minutes - coalesce(unpaid_trip_minutes, 0)) >= 615;

  if not meal_eligible then
    delete from public.manager_notifications n
      where n.type = 'meal_claim'
        and n.job_id in (select id from public.jobs where user_id = p_user and job_date = p_date);
    delete from public.meal_claims m
      where m.user_id = p_user and m.job_date = p_date and m.reviewed_by is null;
    update public.jobs
      set meal_claim_captured = false
      where user_id = p_user and job_date = p_date and meal_claim_captured is true;
  end if;
end;
$$;

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

  if not coalesce(is_office_employee, false)
     and duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > 480
     and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- End-of-shift inventory: the day must carry at least one Field Service inventory
  -- screenshot (office staff are exempt, and days before the rollout date are grandfathered).
  -- Two captures often show the whole list; completeness is the list's line count against the
  -- app's own "N de N" total, checked on the manager's Inventory page, not the number of photos.
  -- The defective-products picture (slot 4, 0097) does not count as an inventory screenshot.
  if not coalesce(is_office_employee, false)
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
