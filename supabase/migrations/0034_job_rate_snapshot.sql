-- 0034: freeze each job's pay inputs onto the job when it is submitted.
--
-- Costing used the employee's CURRENT profile rate for every job, so changing a rate
-- (a CCQ update, or setting classification/annex) rewrote the cost of already-recorded
-- work. Snapshot the rate in effect at submission onto the job; costing then reads the
-- snapshot, so history never drifts while new jobs still pick up the latest rate.

alter table public.jobs
  add column if not exists hourly_rate_snapshot numeric,
  add column if not exists team_leader_premium_snapshot numeric,
  add column if not exists km_rate_snapshot numeric;

-- Stamp the employee's current pay inputs onto the job when it becomes 'submitted'
-- (re-stamped on each submit so an edited-and-resubmitted job reflects the rate then in
-- effect). Approval keeps the submit-time snapshot. Security definer so the value comes
-- from the profile, never from client input.
create or replace function public.stamp_job_rate_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'submitted'
     or (new.status = 'approved' and new.hourly_rate_snapshot is null) then
    select p.hourly_rate, p.team_leader_premium, p.km_rate
      into new.hourly_rate_snapshot, new.team_leader_premium_snapshot, new.km_rate_snapshot
      from public.profiles p
      where p.id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_stamp_rate_snapshot on public.jobs;
create trigger jobs_stamp_rate_snapshot
  before insert or update on public.jobs
  for each row execute function public.stamp_job_rate_snapshot();

revoke all on function public.stamp_job_rate_snapshot() from public, anon, authenticated;

-- Existing jobs keep NULL snapshots; costing falls back to the current profile rate for
-- those (unchanged behavior), because a past rate cannot be reconstructed after the fact.
