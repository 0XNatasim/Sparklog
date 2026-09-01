-- Let a profile opt out of the Live Crew board and the timesheet employee
-- filter. Everyone is shown by default; the boss (Karine Messier) is hidden
-- initially and can toggle herself back on from her own profile.
alter table public.profiles
  add column if not exists show_on_boards boolean not null default true;

update public.profiles
  set show_on_boards = false
  where id = '38034202-cd04-4666-b7d0-3c24ae906afd';
