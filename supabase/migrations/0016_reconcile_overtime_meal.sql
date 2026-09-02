-- Edit reconciliation: when a job's times change (or a job is deleted), the
-- supper / overtime artifacts created earlier can become stale — e.g. a day is
-- entered at 12h (qualifies for supper + overtime), then edited down to 9h29,
-- but the supper claim, overtime evidence, flags and notifications linger.
--
-- The client entry flow only ever ADDS these artifacts, so this function does
-- the REMOVAL side, centrally and for every write path. It never adds anything
-- (creation stays in the entry flow) and never touches finalized records:
--   * only PENDING supper claims (reviewed_by is null) are removed
--   * exported jobs are left alone
--
-- Supper is a whole-day rule; overtime is per-job on the chronological running
-- total. Return-to-storage time is excluded from both (paid at the regular
-- rate, never creates overtime or supper eligibility).

create or replace function public.reconcile_overtime_meal(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  daily_minutes integer := 0;
  meal_eligible boolean;
  r record;
  running integer := 0;
  jm integer;
  has_ot boolean;
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

  -- Supper: weekday and worked minutes past 8h reach the 135-min threshold.
  meal_eligible := extract(dow from p_date) not in (0, 6)
                   and (daily_minutes - 480) >= 135;

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

  -- Overtime: clear evidence on any job that no longer contains overtime
  -- minutes (running total up to and including it stays within 8h).
  for r in
    select id, depart, fin, overtime_evidence_captured, exported_to_sheet
    from public.jobs
    where user_id = p_user and job_date = p_date
    order by depart nulls last, id
  loop
    jm := case when r.depart is not null and r.fin is not null then
      (extract(epoch from (r.fin - r.depart)) / 60)::int
        + case when r.fin < r.depart then 1440 else 0 end
    else 0 end;
    has_ot := (running + jm) > 480;
    running := running + jm;

    if r.overtime_evidence_captured is true and not has_ot
       and coalesce(r.exported_to_sheet, false) = false then
      update public.jobs set overtime_evidence_captured = false where id = r.id;
      delete from public.overtime_evidence e where e.job_id = r.id;
      delete from public.manager_notifications n
        where n.type = 'overtime_evidence' and n.job_id = r.id;
    end if;
  end loop;
end;
$$;
revoke all on function public.reconcile_overtime_meal(uuid, date) from public, anon, authenticated;

-- Reconcile after a job's times change. Scoped to the time columns so the
-- flag updates this function performs never re-fire the trigger (no recursion).
create or replace function public.trg_reconcile_overtime_meal()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.reconcile_overtime_meal(old.user_id, old.job_date);
    return old;
  end if;
  perform public.reconcile_overtime_meal(new.user_id, new.job_date);
  return new;
end;
$$;

drop trigger if exists reconcile_overtime_meal_after_update on public.jobs;
create trigger reconcile_overtime_meal_after_update
  after update of depart, fin, return_time_minutes on public.jobs
  for each row execute function public.trg_reconcile_overtime_meal();

drop trigger if exists reconcile_overtime_meal_after_delete on public.jobs;
create trigger reconcile_overtime_meal_after_delete
  after delete on public.jobs
  for each row execute function public.trg_reconcile_overtime_meal();
