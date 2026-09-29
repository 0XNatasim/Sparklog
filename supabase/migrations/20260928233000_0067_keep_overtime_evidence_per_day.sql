-- Overtime authorization is ONE screenshot per employee per day. The app asks for it on
-- whichever job is being saved when the day's total passes 8h, and every reader (the
-- employee form, the manager timesheet, the "À vérifier" box, the clock marker) treats
-- it at the day level. reconcile_overtime_meal() instead kept it only on the job that
-- crosses 8h in CHRONOLOGICAL order and deleted it anywhere else, so a day entered out
-- of order lost its screenshot on the next edit, submission or deletion (2026-09-28:
-- three employees). The screenshot is now kept wherever it sits in the day; the
-- day-level rule in reconcile_overtime_evidence() (delete only when the whole day is
-- <= 8h) is unchanged.

-- 1) Meal reconciliation no longer touches overtime evidence.
create or replace function public.reconcile_overtime_meal(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  daily_minutes integer := 0;
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
end;
$$;

-- 2) Deleting the job that carries the day's screenshot moves it (and its manager
--    notification) to another job of the same day instead of cascading it away. Only
--    child rows are updated here: touching other jobs rows from a BEFORE DELETE trigger
--    would conflict with a multi-row delete of the same day.
create or replace function public.rehome_overtime_evidence_before_job_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target uuid;
begin
  if not exists (select 1 from public.overtime_evidence e where e.job_id = old.id) then
    return old;
  end if;

  select j.id into target
    from public.jobs j
    where j.user_id = old.user_id
      and j.job_date = old.job_date
      and j.id <> old.id
    order by j.ended_at desc nulls last, j.fin desc nulls last, j.id desc
    limit 1;

  if target is not null then
    update public.overtime_evidence set job_id = target where job_id = old.id;
    update public.manager_notifications
      set job_id = target
      where job_id = old.id and type = 'overtime_evidence';
  end if;
  return old;
end;
$$;

drop trigger if exists jobs_rehome_overtime_evidence on public.jobs;
create trigger jobs_rehome_overtime_evidence
  before delete on public.jobs
  for each row execute function public.rehome_overtime_evidence_before_job_delete();

-- 3) After a delete, the job that now holds the screenshot gets its capture flag. AFTER
--    ROW triggers run once the statement's rows are processed (and after the evidence
--    cascade and reconcile_overtime_evidence, which sort before this name).
create or replace function public.sync_overtime_evidence_flag_after_job_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.jobs j
    set overtime_evidence_captured = true
    where j.user_id = old.user_id
      and j.job_date = old.job_date
      and j.overtime_evidence_captured is not true
      and exists (select 1 from public.overtime_evidence e where e.job_id = j.id);
  return old;
end;
$$;

drop trigger if exists jobs_sync_overtime_evidence_flag on public.jobs;
create trigger jobs_sync_overtime_evidence_flag
  after delete on public.jobs
  for each row execute function public.sync_overtime_evidence_flag_after_job_delete();
