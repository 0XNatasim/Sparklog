-- 0085: P-12 — the rate snapshot is taken when a job is SUBMITTED, never again after.
--
-- 0034 stamped the employee's current pay inputs whenever a written row had
-- status = 'submitted'. That covered every UPDATE of an already-submitted job, not only
-- the submission itself:
--   * an export rollback (push_approved_batch.revertClaim: approved → submitted) re-rated
--     the job at the employee's CURRENT rate, so a raise given after the work was done
--     rewrote the pay of jobs whose export failed;
--   * any later write to a pending job (overtime-proof / meal / parking flags set by
--     triggers, service metadata) did the same while it waited for approval.
--
-- Now a snapshot is taken only:
--   * on INSERT of a submitted job, or on a transition saved/updated → submitted
--     (a job returned for correction and submitted again gets the rate then in effect,
--     as before);
--   * on a job reaching 'approved' without any snapshot (legacy rows).
-- Every other write keeps the snapshot already on the row. Existing snapshots are not
-- touched: a rate overwritten by an earlier rollback cannot be reconstructed.

create or replace function public.stamp_job_rate_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (new.status = 'submitted'
      and (tg_op = 'INSERT' or coalesce(old.status, 'saved') in ('saved', 'updated')))
     or (new.status = 'approved' and new.hourly_rate_snapshot is null) then
    select p.hourly_rate, p.team_leader_premium, p.km_rate
      into new.hourly_rate_snapshot, new.team_leader_premium_snapshot, new.km_rate_snapshot
      from public.profiles p
      where p.id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_job_rate_snapshot() from public, anon, authenticated;
