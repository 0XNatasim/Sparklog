-- 0046: per-employee overtime policy for the first overtime hour.
--
-- CCQ default: the first hour of overtime in a week is paid at time-and-a-half
-- (1.5x) and everything beyond at double time (2x). Some employers pay that first
-- hour at double time too. This flag, set per employee by a manager, switches the
-- first-hour treatment: when true, there is no 1.5x tier — all overtime is 2x.
--
-- It is a pay parameter like team_leader_premium (no NAS/SIN), so the existing
-- manager profile-write policy covers it; no special trigger needed.
alter table public.profiles
  add column if not exists overtime_first_hour_double boolean not null default false;
