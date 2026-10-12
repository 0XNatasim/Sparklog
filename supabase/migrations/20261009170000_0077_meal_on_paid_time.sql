-- 0077: the supper (repas du soir) eligibility follows PAID time for employees with the
-- "first trip unpaid" option (profiles.first_trip_unpaid, migration 0070).
--
-- A weekday supper needs 8 h + 2 h 15 = 615 minutes. For these employees the day's first
-- Départ→Arrivée trip is not paid, so it no longer counts toward the 615 minutes (same
-- rule as the overtime proof, migration 0076, and the payroll engine). Everyone else keeps
-- the gross rule. The body is the 0067 reconcile_overtime_meal; the only changes are the
-- unpaid-trip deduction and the extra `arrivee` column on the re-check trigger, because
-- editing the first job's Arrivée now changes the paid total.

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
                   and (daily_minutes - coalesce(unpaid_trip_minutes, 0) - 480) >= 135;

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

-- Same trigger as 0016 plus `arrivee`. The function's own flag updates touch none of
-- these columns, so there is still no recursion.
drop trigger if exists reconcile_overtime_meal_after_update on public.jobs;
create trigger reconcile_overtime_meal_after_update
  after update of depart, arrivee, fin, return_time_minutes on public.jobs
  for each row execute function public.trg_reconcile_overtime_meal();
