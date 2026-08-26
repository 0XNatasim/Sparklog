-- Managers can pause former employees without deleting their account or history.
alter table public.profiles
  add column if not exists is_paused boolean not null default false;
