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
  -- The deadline governs employee entry only. Manager updates come through
  -- either the manager's authenticated browser session or a trusted Edge
  -- Function using the service-role client during approval/export.
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

  -- The complete configured minute remains available to employees.
  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;

  return new;
end;
$$;
