-- The day's overtime screenshot now always sits on the day's LAST job (latest end), the
-- same job the timesheets mark with the clock. The app still asks for it on whichever
-- job is saved when the day passes 8h; the database moves it (with its manager
-- notification and the capture flag) to the last job, and keeps it there when jobs are
-- added, re-timed or deleted. The day-level rule (screenshot removed when the whole day
-- is <= 8h) is unchanged.

create or replace function public.attach_overtime_evidence_to_last_job(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  last_job uuid;
begin
  if p_user is null or p_date is null then return; end if;
  if not exists (select 1 from public.overtime_evidence e where e.user_id = p_user and e.job_date = p_date) then
    return;
  end if;

  select j.id into last_job
    from public.jobs j
    where j.user_id = p_user and j.job_date = p_date
    order by j.ended_at desc nulls last, j.fin desc nulls last, j.id desc
    limit 1;
  if last_job is null then return; end if;

  update public.overtime_evidence e
    set job_id = last_job
    where e.user_id = p_user and e.job_date = p_date and e.job_id <> last_job;

  update public.manager_notifications n
    set job_id = last_job
    where n.type = 'overtime_evidence'
      and n.job_id <> last_job
      and n.job_id in (select j.id from public.jobs j where j.user_id = p_user and j.job_date = p_date);

  -- Flag-only updates: allowed by the entry-window and manager-field guards, not logged
  -- as employee activity, and they do not re-fire the time-based triggers below.
  update public.jobs j
    set overtime_evidence_captured = (j.id = last_job)
    where j.user_id = p_user and j.job_date = p_date
      and j.overtime_evidence_captured is distinct from (j.id = last_job);
end;
$$;

-- A new screenshot, or a job added / re-timed / re-flagged, re-attaches the day.
create or replace function public.attach_overtime_evidence_after_evidence_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.attach_overtime_evidence_to_last_job(new.user_id, new.job_date);
  return null;
end;
$$;

drop trigger if exists overtime_evidence_attach_to_last_job on public.overtime_evidence;
create trigger overtime_evidence_attach_to_last_job
  after insert on public.overtime_evidence
  for each row execute function public.attach_overtime_evidence_after_evidence_insert();

create or replace function public.attach_overtime_evidence_after_job_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.attach_overtime_evidence_to_last_job(old.user_id, old.job_date);
    return null;
  end if;
  perform public.attach_overtime_evidence_to_last_job(new.user_id, new.job_date);
  if tg_op = 'UPDATE' and new.job_date is distinct from old.job_date then
    perform public.attach_overtime_evidence_to_last_job(old.user_id, old.job_date);
  end if;
  return null;
end;
$$;

drop trigger if exists jobs_attach_overtime_evidence on public.jobs;
create trigger jobs_attach_overtime_evidence
  after insert or update of job_date, depart, fin, overtime_evidence_captured on public.jobs
  for each row execute function public.attach_overtime_evidence_after_job_write();

-- The 0067 after-delete flag sync becomes the same re-attachment (the 0067 BEFORE DELETE
-- trigger still keeps the screenshot from cascading away with its job).
create or replace function public.sync_overtime_evidence_flag_after_job_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.attach_overtime_evidence_to_last_job(old.user_id, old.job_date);
  return old;
end;
$$;

-- 0067's BEFORE DELETE re-home also carries an overtime notification that has no
-- screenshot row on the deleted job (e.g. filed without an evidence_id).
create or replace function public.rehome_overtime_evidence_before_job_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target uuid;
begin
  if not exists (select 1 from public.overtime_evidence e where e.job_id = old.id)
     and not exists (select 1 from public.manager_notifications n
                     where n.job_id = old.id and n.type = 'overtime_evidence') then
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

-- The app files the manager notification right after the screenshot, pointing at the
-- job it was captured on; point it at the job that now holds the screenshot.
create or replace function public.point_overtime_notification_at_evidence_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  holder uuid;
begin
  if new.type = 'overtime_evidence' and new.evidence_id is not null then
    select e.job_id into holder from public.overtime_evidence e where e.id = new.evidence_id;
    if holder is not null then new.job_id := holder; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists manager_notifications_point_at_evidence_job on public.manager_notifications;
create trigger manager_notifications_point_at_evidence_job
  before insert on public.manager_notifications
  for each row execute function public.point_overtime_notification_at_evidence_job();

-- Existing days.
do $$
declare
  d record;
begin
  for d in select distinct user_id, job_date from public.overtime_evidence loop
    perform public.attach_overtime_evidence_to_last_job(d.user_id, d.job_date);
  end loop;
end;
$$;
