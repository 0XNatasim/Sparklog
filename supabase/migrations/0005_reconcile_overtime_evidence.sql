-- Reconcile overtime evidence when a work day is corrected below the 8h
-- threshold, and stop overtime-edit notifications from piling up.
--
-- Two problems this fixes, both triggered when a manager unlocks an overtime
-- job and the employee corrects it:
--   1. Every corrective save fired notify_overtime_job_edit(), inserting a new
--      "overtime_job_edited" notification each time (notification spam).
--   2. The overtime_evidence row and the jobs.overtime_evidence_captured flag
--      (the amber badge on the OT card) were never cleared when the corrected
--      day dropped back under 8h, so the badge/notification stayed forever.
--
-- Overtime is a per-day concept: evidence is required when the total WORKED
-- time for a (user, job_date) exceeds 8h (return-to-storage time excluded,
-- mirroring the client's requiresOvertimeEvidence()).

-- -----------------------------------------------------------------------------
-- Helper: total worked minutes for a user on a given day.
-- -----------------------------------------------------------------------------
create or replace function public.overtime_day_minutes(p_user uuid, p_date date)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(
    extract(epoch from (
      case when j.fin >= j.depart then j.fin - j.depart
           else j.fin - j.depart + interval '24 hours' end
    )) / 60
  ), 0)::int
  from public.jobs j
  where j.user_id = p_user
    and j.job_date = p_date
    and j.depart is not null
    and j.fin is not null;
$$;

-- -----------------------------------------------------------------------------
-- Only notify managers of an overtime edit once per correction: skip the insert
-- when an unread "overtime_job_edited" notification already exists for the job.
-- -----------------------------------------------------------------------------
create or replace function public.notify_overtime_job_edit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  proof public.overtime_evidence%rowtype;
begin
  -- Manager/service-role changes (approval, unlock, maintenance) must not
  -- create employee-edit notifications.
  if auth.uid() is null or auth.uid() <> new.user_id then
    return new;
  end if;

  select * into proof
  from public.overtime_evidence
  where job_id = new.id
  order by created_at desc
  limit 1;

  if proof.id is not null then
    -- Collapse repeated saves during a single correction into one notification:
    -- do not insert if an unacknowledged edit notification already stands for
    -- this job (no manager has read it yet).
    if not exists (
      select 1
      from public.manager_notifications n
      where n.job_id = new.id
        and n.type = 'overtime_job_edited'
        and not exists (
          select 1 from public.manager_notification_reads r
          where r.notification_id = n.id
        )
    ) then
      insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes)
      values ('overtime_job_edited', new.user_id, new.id, proof.id, proof.daily_minutes);
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clear overtime evidence for a day that is no longer in overtime. Deleting the
-- evidence cascades to its manager_notifications (evidence_id ... on delete
-- cascade), and we drop the amber capture flag on that day's jobs.
-- -----------------------------------------------------------------------------
create or replace function public.reconcile_overtime_evidence()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  p_user uuid;
  p_date date;
begin
  if tg_op = 'DELETE' then
    p_user := old.user_id;
    p_date := old.job_date;
  else
    p_user := new.user_id;
    p_date := new.job_date;
  end if;

  if public.overtime_day_minutes(p_user, p_date) <= 480 then
    delete from public.overtime_evidence
      where user_id = p_user and job_date = p_date;
    update public.jobs
      set overtime_evidence_captured = false
      where user_id = p_user
        and job_date = p_date
        and overtime_evidence_captured = true;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- The reconcile UPDATE only touches overtime_evidence_captured, which is not in
-- this trigger's column list, so it does not re-fire (no recursion).
drop trigger if exists jobs_reconcile_overtime_evidence on public.jobs;
create trigger jobs_reconcile_overtime_evidence
  after insert or delete or update of job_date, depart, fin, status on public.jobs
  for each row execute function public.reconcile_overtime_evidence();

-- These run only from triggers (as definer); they should not be callable via the
-- REST/RPC surface by anon or signed-in users.
revoke all on function public.overtime_day_minutes(uuid, date) from public, anon, authenticated;
revoke all on function public.notify_overtime_job_edit() from public, anon, authenticated;
revoke all on function public.reconcile_overtime_evidence() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- One-time cleanup: clear evidence (and, via cascade, notifications) for any day
-- that already carries overtime evidence but is no longer over 8h.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select distinct user_id, job_date from public.overtime_evidence loop
    if public.overtime_day_minutes(r.user_id, r.job_date) <= 480 then
      delete from public.overtime_evidence
        where user_id = r.user_id and job_date = r.job_date;
      update public.jobs
        set overtime_evidence_captured = false
        where user_id = r.user_id and job_date = r.job_date and overtime_evidence_captured = true;
    end if;
  end loop;
end $$;
