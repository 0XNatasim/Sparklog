-- 0032: replace the hardcoded privileged UUIDs with an `owner` role.
--
-- Why: the project is open-source. A fork runs a *completely distinct* company (there
-- is no multi-tenancy — one deployment = one company). Hardcoding the owner/dev user
-- ids in is_privileged() (migration 0026) and in src/lib/boss.js meant a fork had to
-- edit source to make its own people privileged. Driving privilege from a DB role lets
-- a fork simply mark one account `owner` in Supabase — no code change.
--
-- Model after this migration:
--   employee  — the crew
--   manager   — full dashboard
--   admin     — administration/office (manager-tier, non-CCQ pay, no NAS)  [0030]
--   owner     — the company owner: manager-tier AND privileged. Replaces the old
--               hardcoded "boss" and "dev" overlays, folded into one tier.
--
-- Privilege (NAS/SIN reveal, role assignment, the crown) now = role 'owner'. There is
-- no separate hardcoded developer any more.

-- 1) Allow the new role value.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('employee', 'manager', 'admin', 'owner'));

-- 2) Authorization tier: both admin and owner are manager-tier, so both collapse to
--    'manager' for every manager RLS policy and trigger bypass. (Owner additionally gets
--    privilege via is_privileged() below.) my_actual_role() still exposes the real value.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case when role in ('admin', 'owner') then 'manager' else role end
    from public.profiles where id = auth.uid();
$$;

-- 3) Privilege is now role-based, not a hardcoded id list. The owner (and only the owner)
--    may reveal NAS/SIN (employee_sensitive RLS + reveal_nas, migration 0026) and assign
--    roles (profiles_enforce_role_change, migration 0031).
create or replace function public.is_privileged()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$fn$;
revoke all on function public.is_privileged() from public, anon;
grant execute on function public.is_privileged() to authenticated;

-- 4) One-time data migration for THIS deployment: promote the accounts that used to be
--    privileged via the hardcoded ids (0026) to the new owner role, so nobody is locked
--    out of NAS/role-assignment the moment this deploys. On a fresh fork these ids do
--    not exist, so this is a harmless no-op there.
update public.profiles set role = 'owner'
  where id in (
    '38034202-cd04-4666-b7d0-3c24ae906afd'::uuid,  -- was: Karine (owner)
    '5f834c60-532d-4c17-b77e-df257c5b66b3'::uuid   -- was: Simon (dev) — folded into owner
  );
