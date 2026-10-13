-- 0086: supper rule revised by the owner on 2026-10-13 (interim payroll authority).
--
-- The 30 $ supper is due on a weekday once the day has 2 h 15 of overtime — at 1.5× or 2×,
-- both are work time — i.e. at least 10 h 15 (615 min) of paid WORK. Return-to-warehouse
-- time never counts (it is never overtime, 0081). Before: > 600 paid minutes, return
-- included (0082). Twin of isMealEligible / dayWorkMinutesWithoutReturn in
-- supabase/functions/_shared/payroll_engine.js.
--
-- reconcile_overtime_meal is re-run by the 0077 triggers whenever a job's times or return
-- change; body otherwise as in 0082 (first trip unpaid, weekdays only, claims already
-- reviewed are kept).

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
  -- Arrivée. Twin of dayFirstTripUnpaidMinutes in supabase/functions/_shared/payroll_engine.js.
  if exists (select 1 from public.profiles p where p.id = p_user and p.first_trip_unpaid) then
    select case
             when d.depart is null or d.arrivee is null or d.fin is null then 0
             else least(
               ((extract(epoch from (d.arrivee - d.depart))::integer / 60) + 1440) % 1440,
               ((extract(epoch from (d.fin - d.depart))::integer / 60) + 1440) % 1440
             )
           end
      into unpaid_trip_minutes
      from (
        select j.depart, j.arrivee, j.fin
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

-- SUPPER v2 (> 600 paid minutes, return included) was decided and replaced the same day:
-- its range becomes empty ([2026-10-13, 2026-10-13)) so v3 starts on 2026-10-13 without
-- overlapping it (payroll_rules_no_overlap), and the row stays in the history.
update public.payroll_rules
   set effective_to = date '2026-10-13'
 where rule_code = 'SUPPER' and version = 2;

insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, parameters, examples, exceptions, version, status, approved_by, approved_at)
select
  'SUPPER', 'Supper / meal eligibility', 'C', '220', 'standard_8h',
  date '2026-10-13', null,
  'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-13 (revised); convention collective ICI 2025-2029, art. 20.07 3) c) i.',
  '{"min_overtime_minutes":135,"min_daily_work_minutes":615,"overtime_rates_counted":["1.5x","2x"],"return_time_counts":false,"weekdays_only":true,"weekend_worked":false}'::jsonb,
  '[{"input":"weekday, 10 h 15 of work without return (2 h 15 of overtime, 1.5x or 2x)","expected":"supper eligible"},{"input":"weekday, 10 h 14 of work without return","expected":"not eligible"},{"input":"weekday, 9 h of work + 1 h 30 of return","expected":"not eligible (return never counts)"},{"input":"weekend","expected":"not applicable - no weekend work"}]'::jsonb,
  '[]'::jsonb, 3, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
where not exists (select 1 from public.payroll_rules where rule_code = 'SUPPER' and version = 3);
