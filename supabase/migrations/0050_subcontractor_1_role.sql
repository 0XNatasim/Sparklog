-- 0050: subcontractor-1 timekeeping role.
--
-- Subcontractors use the employee time-entry workflow and employee RLS tier, but are
-- intentionally excluded from SparkLog's DAS payroll bench and CCQ reporting.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('employee', 'subcontractor_1', 'manager', 'admin', 'owner'));

-- Preserve all authorization behavior from 0045 while mapping subcontractors to the
-- employee tier so existing own-data policies continue to apply.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case
           when role = 'owner' then 'manager'
           when role = 'admin' and coalesce(array_length(admin_sections, 1), 0) > 0 then 'manager'
           when role in ('admin', 'subcontractor_1') then 'employee'
           else role
         end
    from public.profiles where id = auth.uid();
$$;

-- Active subcontractors can create and maintain their own time entries exactly like
-- active employees. Paused-account containment remains unchanged.
create or replace function public.is_active_employee()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('employee', 'subcontractor_1')
      and is_paused = false
  );
$$;

revoke all on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated;
