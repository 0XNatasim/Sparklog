-- 0082: owner decisions of 2026-10-13 (interim payroll authority).
--
-- 1. Supper (repas du soir, 30 $): due when the weekday's PAID time goes past 10 h
--    (> 600 minutes) instead of 10 h 15 (615). Convention ICI 2025-2029, 20.07 3) c) i.:
--    overtime « consécutives à une journée de dix heures ». Twin of isMealEligible in
--    supabase/functions/_shared/payroll_engine.js. The body is the 0077
--    reconcile_overtime_meal; only the threshold changes. Claims already reviewed are kept;
--    days already submitted are re-checked the next time one of their jobs changes.
--
-- 2. payroll_rules: SUPPER v1 (615 min) ends 2026-10-12; SUPPER v2 (> 600 min) starts
--    2026-10-13, so the approved history stays readable.
--
-- 3. profiles.team_leader_premium_overtime: per-employee option. When true the
--    team-leader premium is also paid on overtime hours, majorée like the wage (×1,5 / ×2)
--    — convention 22.01 excludes the 22.03 premiums from « majoration avant prime ».
--    Off (default): the premium is paid on regular hours only, as Messier's stubs print it.
--    Pay parameter (no NAS/SIN): the manager profile-write policy covers it and the
--    employee whitelist trigger (0018) keeps employees from changing it.

create or replace function public.reconcile_overtime_meal(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  daily_minutes integer := 0;
  unpaid_trip_minutes integer := 0;
  meal_eligible boolean;
begin
  if p_user is null or p_date is null then return; end if;

  select coalesce(sum(
    case when j.depart is not null and j.fin is not null then
      (extract(epoch from (j.fin - j.depart)) / 60)::int
        + case when j.fin < j.depart then 1440 else 0 end
    else 0 end
  ), 0)
  into daily_minutes
  from public.jobs j
  where j.user_id = p_user and j.job_date = p_date;

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

  meal_eligible := extract(dow from p_date) not in (0, 6)
                   and (daily_minutes - coalesce(unpaid_trip_minutes, 0)) > 600;

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

update public.payroll_rules
   set effective_to = date '2026-10-12'
 where rule_code = 'SUPPER' and version = 1 and effective_to is null;

insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, parameters, examples, exceptions, version, status, approved_by, approved_at)
select
  'SUPPER', 'Supper / meal eligibility', 'C', '220', 'standard_8h',
  date '2026-10-13', null,
  'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-13; convention collective ICI 2025-2029, art. 20.07 3) c) i.',
  '{"min_daily_worked_minutes":601,"weekdays_only":true,"weekend_worked":false}'::jsonb,
  '[{"input":"weekday, more than 600 paid minutes (past 10 h)","expected":"supper eligible"},{"input":"weekday, exactly 600 paid minutes","expected":"not eligible"},{"input":"weekend","expected":"not applicable - no weekend work"}]'::jsonb,
  '[]'::jsonb, 2, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
where not exists (select 1 from public.payroll_rules where rule_code = 'SUPPER' and version = 2);

alter table public.profiles
  add column if not exists team_leader_premium_overtime boolean not null default false;

comment on column public.profiles.team_leader_premium_overtime is
  'Team-leader premium also paid on overtime hours, majorée like the wage (x1.5 / x2). Off: premium on regular hours only.';
