-- Employee time off (a day off or a range / week off). A managed schedule so
-- people who aren't working don't show on the Live Crew board for those days.
create table if not exists public.employee_time_off (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint employee_time_off_range check (end_date >= start_date)
);

create index if not exists employee_time_off_user_idx on public.employee_time_off (user_id, start_date, end_date);

alter table public.employee_time_off enable row level security;

-- Managers manage everyone's time off; employees may read their own.
drop policy if exists "time_off: managers all" on public.employee_time_off;
create policy "time_off: managers all" on public.employee_time_off
  for all using (public.get_my_role() = 'manager')
  with check (public.get_my_role() = 'manager');

drop policy if exists "time_off: read own" on public.employee_time_off;
create policy "time_off: read own" on public.employee_time_off
  for select using (user_id = auth.uid());
