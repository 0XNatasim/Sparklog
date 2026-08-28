-- Team leader premium: extra $/hour a designated team leader earns.
-- Non-zero value marks the employee as a team leader.
alter table public.profiles
  add column if not exists team_leader_premium numeric not null default 0;
