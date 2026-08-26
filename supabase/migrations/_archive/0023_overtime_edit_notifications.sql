-- Notify managers again when an employee edits a job that already has an
-- overtime SMS proof. The original upload notification is created by the
-- frontend; this trigger covers later employee edits after a manager unlocks
-- the job.

create or replace function public.notify_overtime_job_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    insert into public.manager_notifications (
      type,
      employee_id,
      job_id,
      evidence_id,
      daily_minutes
    ) values (
      'overtime_job_edited',
      new.user_id,
      new.id,
      proof.id,
      proof.daily_minutes
    );
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_notify_overtime_edit on public.jobs;
create trigger jobs_notify_overtime_edit
after update of job_date, ot, depart, arrivee, fin, km_total, km_aller,
  km_retour, return_time_minutes, status
on public.jobs
for each row execute function public.notify_overtime_job_edit();
