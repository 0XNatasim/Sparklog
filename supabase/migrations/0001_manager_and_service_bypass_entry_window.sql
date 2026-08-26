-- Managers approve jobs through the push_approved_batch Edge Function, which
-- runs as the service role. In that context auth.uid() is null, so
-- get_my_role() is not 'manager' and enforce_job_entry_window fell through to
-- the deadline check -- blocking approval of any past-dated job with "The entry
-- deadline for this work date has passed". The day exception did not help
-- either, because the unlock was looked up by auth.uid() (null) instead of the
-- job's owner.
--
-- Fix both: never enforce the window for managers OR for trusted backend /
-- service-role writes (no JWT user), and match the day exception on the job's
-- employee (new.user_id) rather than the caller.
create or replace function public.enforce_job_entry_window()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  local_now timestamp;
  deadline time;
  has_unlock boolean;
  unchanged public.jobs;
begin
  if public.get_my_role() = 'manager' or auth.uid() is null then return new; end if;

  -- Allow updates that only toggle capture flags: neutralize those columns and,
  -- if nothing else differs, let the write through without deadline enforcement.
  if tg_op = 'UPDATE' then
    unchanged := new;
    unchanged.parking_receipt_captured := old.parking_receipt_captured;
    unchanged.meal_claim_captured := old.meal_claim_captured;
    unchanged.overtime_evidence_captured := old.overtime_evidence_captured;
    if unchanged is not distinct from old then
      return new;
    end if;
  end if;

  select timezone('America/Toronto', now()) into local_now;
  select daily_deadline into deadline from public.company_time_settings where id = true;
  deadline := coalesce(deadline, '23:59'::time);

  -- The day exception belongs to the job's employee, not necessarily the caller.
  select exists (
    select 1 from public.job_entry_unlocks
    where user_id = new.user_id and job_date = new.job_date
      and (unlocked_until is null or unlocked_until > now())
  ) into has_unlock;
  if has_unlock then return new; end if;

  if exists (select 1 from public.company_holidays where holiday_date = new.job_date) then
    raise exception 'Jobs cannot be entered for a company holiday';
  end if;

  -- The entire configured minute is permitted. A 23:59 deadline blocks at midnight.
  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;
  return new;
end;
$$;
