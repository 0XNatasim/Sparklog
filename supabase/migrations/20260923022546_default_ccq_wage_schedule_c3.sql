-- 0052: default CCQ employees to the general daytime-work schedule (C3).
-- Existing non-empty schedule selections are preserved.

alter table public.profiles
  alter column wage_schedule set default 'C3';

update public.profiles
set wage_schedule = 'C3'
where role in ('employee', 'manager')
  and (wage_schedule is null or btrim(wage_schedule) = '');
