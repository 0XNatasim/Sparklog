-- 0042: Administration ('admin') is an OFFICE EMPLOYEE, not a manager tier.
--
-- Reverses the 0030 decision that collapsed admin -> manager. Administration staff are
-- non-CCQ office workers who log a (simplified) timesheet like any employee and must
-- NOT have manager reach: no employee management, no dashboard, no "view as employee",
-- no activating/deactivating other users.
--
-- get_my_role() now authorizes 'admin' as 'employee' (own-data access only), so every
-- RLS policy, trigger bypass and screen that gates on manager access excludes admins.
-- The raw profiles.role stays 'admin' — the app reads it for labels and the payroll
-- export reads it (via my_actual_role) to mark the row flat-hourly / non-CCQ. NAS/SIN
-- stays owner-only (is_privileged), unaffected.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case when role = 'admin' then 'employee' else role end
    from public.profiles where id = auth.uid();
$$;
