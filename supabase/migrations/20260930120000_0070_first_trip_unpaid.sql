-- 0070: per-employee policy — the first trip of the day (Départ → Arrivée of the day's
-- first job) is unpaid. Pay parameter (no NAS/SIN); managers already write it through the
-- existing profile policy and the employee whitelist trigger keeps employees out of it.
alter table public.profiles
  add column if not exists first_trip_unpaid boolean not null default false;
