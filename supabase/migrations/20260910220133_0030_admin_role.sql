-- 0030: add the `admin` (administration / office) role.
--
-- Context: the company hired someone to help with administration. They are NOT a
-- CCQ tradesperson — they are paid flat-hourly, not on the CCQ wage grid — but for
-- everything they DO in the app they should have the same reach as a manager, with
-- one exception: they must NEVER see NAS/SIN.
--
-- Design decisions:
--   1. `admin` is a MANAGER-TIER role for authorization. Rather than editing ~40
--      RLS policies that inline `get_my_role() = 'manager'` (and risking a missed
--      one, which is a silent access bug), we collapse `admin` -> `manager` inside
--      get_my_role(). Every manager policy, trigger bypass (entry window, profile
--      whitelist) and screen then applies to admins unchanged.
--   2. The distinction is preserved in the raw `profiles.role` column, which the app
--      reads directly (for labels) and the payroll export reads (to mark admin rows
--      as flat-hourly, non-CCQ). `my_actual_role()` exposes the untouched value to
--      anything that needs it.
--   3. NAS/SIN is NOT affected by this collapse: `is_privileged()` gates the vault on
--      explicit user ids (owner + dev) and an admin is never in that list, so RLS on
--      `employee_sensitive` and the `reveal_nas()` RPC keep the admin out. This is the
--      requested "manager access, but restricted for NAS/SIN".
--   4. Own-data writes are already role-agnostic (`is_not_paused()`, migrations
--      0027-0029) and job insert/update run through the manager policies, so an admin
--      can log their own Départ/Arrivée/Fin exactly like a manager who works the field.

-- Widen the role check constraint. The inline check from the baseline schema is named
-- profiles_role_check by Postgres; drop-if-exists keeps this safe on any environment.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('employee', 'manager', 'admin'));

-- Authorization tier. `admin` collapses to `manager` here so every manager RLS policy
-- and trigger bypass applies to admins. This does NOT grant NAS/SIN access (see header
-- note 3). Employees and managers are returned unchanged.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case when role = 'admin' then 'manager' else role end
    from public.profiles where id = auth.uid();
$$;

-- The caller's true, un-collapsed role, for callers that must distinguish admin from
-- manager (e.g. pay basis). Kept separate from get_my_role() so authorization stays
-- centralised in the collapsing function above.
create or replace function public.my_actual_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select role from public.profiles where id = auth.uid();
$$;
revoke all on function public.my_actual_role() from public, anon;
grant execute on function public.my_actual_role() to authenticated;
