-- 0045: owners can grant an administration (office) employee access to selected
-- management (Gestion) sections.
--
-- Default remains "no manager access" (0042). An owner may tick specific sections
-- (live, timesheet, notifications, employees, forms) in the admin's profile. When an
-- admin has at least one granted section, get_my_role() elevates them to manager-tier
-- so the underlying data loads; the app then shows ONLY the granted sections. NAS/SIN
-- and role assignment stay owner-only (is_privileged), so a granted admin is still
-- "manager access minus NAS/SIN minus role changes".
alter table public.profiles
  add column if not exists admin_sections text[] not null default '{}';

-- Authorization tier:
--   owner                          -> manager (0032)
--   admin WITH granted sections    -> manager (this migration)
--   admin WITHOUT granted sections -> employee (0042)
--   everyone else                  -> unchanged
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case
           when role = 'owner' then 'manager'
           when role = 'admin' and coalesce(array_length(admin_sections, 1), 0) > 0 then 'manager'
           when role = 'admin' then 'employee'
           else role
         end
    from public.profiles where id = auth.uid();
$$;

-- Only the owner may grant or revoke an admin's management sections. Without this a
-- granted admin (now manager-tier) could edit profiles and escalate themselves or a
-- peer by writing admin_sections directly. Service role (auth.uid() null) is exempt.
create or replace function public.enforce_admin_sections_privileged()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.admin_sections is distinct from old.admin_sections
     and auth.uid() is not null
     and not public.is_privileged() then
    raise exception 'Only the owner may change management access';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_admin_sections on public.profiles;
create trigger profiles_enforce_admin_sections before update on public.profiles
  for each row execute function public.enforce_admin_sections_privileged();

revoke all on function public.enforce_admin_sections_privileged() from public, anon, authenticated;
