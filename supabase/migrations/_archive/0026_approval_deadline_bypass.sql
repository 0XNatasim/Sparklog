create or replace function public.enforce_job_entry_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  deadline time;
  has_unlock boolean;
begin
  -- Approval is a manager/export operation, not an employee entry.  The
  -- service-role request used by an Edge Function does not consistently carry
  -- the caller's manager JWT into database triggers, so identify this
  -- transition from the row itself before applying the employee deadline.
  if tg_op = 'UPDATE'
    and old.status = 'submitted'
    and new.status = 'approved'
    and new.locked is true
  then
    return new;
  end if;

  -- Direct dashboard updates made with a manager session, and trusted
  -- service-role operations, are also outside the employee entry window.
  if auth.role() = 'service_role' or public.get_my_role() = 'manager' then
    return new;
  end if;

  select timezone('America/Toronto', now()) into local_now;
  select daily_deadline into deadline from public.company_time_settings where id = true;
  deadline := coalesce(deadline, '23:59'::time);

  select exists (
    select 1
    from public.job_entry_unlocks
    where user_id = auth.uid()
      and job_date = new.job_date
      and (unlocked_until is null or unlocked_until > now())
  ) into has_unlock;
  if has_unlock then return new; end if;

  if exists (
    select 1 from public.company_holidays where holiday_date = new.job_date
  ) then
    raise exception 'Jobs cannot be entered for a company holiday';
  end if;

  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;

  return new;
end;
$$;
