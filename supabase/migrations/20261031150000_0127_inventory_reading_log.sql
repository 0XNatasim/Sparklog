-- 0127: what the employee saw when leaving the end-of-shift inventory step (V2.4.215).
--
-- One row each time an employee presses « Continuer » on the inventory step: how the reading of the day's screenshots
-- stood (state, lines read, lines expected, lines missing, lines unreadable) and what the step asked (block: wait /
-- retake / override / none), so a manager can later answer « did they get the message that a line was missing? ».
-- Written by the employee's own browser for their own account only; read by the managers; never edited or deleted
-- by the browser. It holds counts only, no picture and no line name.

create table if not exists public.inventory_reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  reading_state text,
  lines_read integer check (lines_read is null or lines_read between 0 and 1000),
  lines_expected integer check (lines_expected is null or lines_expected between 0 and 1000),
  lines_missing integer check (lines_missing is null or lines_missing between 0 and 1000),
  lines_unreadable integer check (lines_unreadable is null or lines_unreadable between 0 and 1000),
  step_block text check (step_block is null or step_block in ('wait', 'retake', 'override')),
  reading_known boolean not null default true,
  complement_tried boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inventory_reading_log_day_idx on public.inventory_reading_log (job_date desc, user_id);

-- The author and the time are the server's, not the browser's.
create or replace function public.inventory_reading_log_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists inventory_reading_log_guard on public.inventory_reading_log;
create trigger inventory_reading_log_guard before insert on public.inventory_reading_log
  for each row execute function public.inventory_reading_log_guard();
revoke all on function public.inventory_reading_log_guard() from public, anon, authenticated;

alter table public.inventory_reading_log enable row level security;

drop policy if exists "inventory_reading_log: own insert" on public.inventory_reading_log;
drop policy if exists "inventory_reading_log: managers read" on public.inventory_reading_log;
create policy "inventory_reading_log: own insert" on public.inventory_reading_log
  for insert to authenticated with check (user_id = auth.uid());
create policy "inventory_reading_log: managers read" on public.inventory_reading_log
  for select to authenticated using (public.get_my_role() = 'manager');

revoke all on public.inventory_reading_log from anon, public, authenticated;
grant select, insert on public.inventory_reading_log to authenticated;
