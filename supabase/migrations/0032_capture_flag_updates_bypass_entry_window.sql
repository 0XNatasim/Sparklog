-- The parking/meal capture triggers (0031) update public.jobs to flip a
-- capture flag whenever a receipt or meal claim is inserted.  That UPDATE fires
-- enforce_job_entry_window, which raises "The entry deadline for this work date
-- has passed" for any non-manager whose job is past its deadline -- so the
-- receipt/claim insert is rolled back and nothing shows up.  0028 worked around
-- this by disabling the trigger around its bulk update, but the per-row capture
-- triggers (and the client's own meal_claim_captured update) cannot.
--
-- Fix the enforcement itself: a bookkeeping update that only flips the capture
-- flags reflects an expense on an existing job, not a new or edited time entry,
-- so it must never be blocked by the entry window.
create or replace function public.enforce_job_entry_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp;
  deadline time;
  has_unlock boolean;
  unchanged public.jobs;
begin
  if public.get_my_role() = 'manager' then return new; end if;

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

  select exists (
    select 1 from public.job_entry_unlocks
    where user_id = auth.uid() and job_date = new.job_date
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
