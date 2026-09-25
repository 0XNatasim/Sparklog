-- The return-time picker (RETURN_TIME_OPTIONS) offers 5-minute increments
-- (5,10,15,20,25,30,45,…) but the old check only allowed multiples of 15, so picking e.g.
-- 20 min made the job unsaveable ("violates check constraint jobs_return_time_minutes_check").
-- Align the DB to the UI: 0–240 min in 5-minute steps.
alter table public.jobs drop constraint if exists jobs_return_time_minutes_check;
alter table public.jobs add constraint jobs_return_time_minutes_check
  check (return_time_minutes >= 0 and return_time_minutes <= 240 and (return_time_minutes % 5) = 0);
