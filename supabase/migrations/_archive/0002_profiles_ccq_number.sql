-- Add CCQ number to profiles for payroll exports
alter table public.profiles
  add column if not exists ccq_number text;

-- Allow managers to update any profile (they need to set the CCQ number on
-- each employee). Employees already have a "profiles: own update" policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles: manager update all'
  ) then
    create policy "profiles: manager update all"
      on public.profiles for update
      using (public.get_my_role() = 'manager')
      with check (public.get_my_role() = 'manager');
  end if;
end $$;
