-- 0139: no supper for « 4 jours de 10 h » (V2.4.254, payroll engine 2.10.0).
--
-- Owner decision 2026-11-13: an employee with profiles.ten_hour_days owes no supper at all (0135 had moved it to 12 h 15 of
-- work). reconcile_overtime_meal, the database twin of isMealEligible (src / _shared/payroll_engine.js), now treats such an
-- employee as never eligible: any supper claim not reviewed yet is removed for the day. Body of 0135; only that rule changes.

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

  -- Regular day + 2 h 15 of overtime = 615 minutes of paid work (8 h day); return excluded. An employee on 4 days of 10 h
  -- (profiles.ten_hour_days, engine 2.10.0, owner decision 2026-11-13) has no supper at all.
  meal_eligible := extract(dow from p_date) not in (0, 6)
                   and not exists (select 1 from public.profiles p
                                    where p.id = p_user and p.ten_hour_days
                                      and p.role not in ('foreman', 'subcontractor_1'))
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
