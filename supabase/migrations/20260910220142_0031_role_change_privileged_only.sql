-- 0031: only privileged users (owner + dev) may change a user's role.
--
-- The role picker is a boss/dev-only control in the UI (EmployeesPanel). This guard
-- makes that privilege real instead of cosmetic: a plain manager — or an admin, which
-- is manager-tier — cannot change anyone's role through a direct API call; only Karine
-- (owner) and Simon (dev) can, exactly the two accounts is_privileged() covers.
--
-- The service role is unaffected: it runs with auth.uid() = null (handle_new_user
-- seeding a new profile, edge functions, the Supabase SQL/table editor), so role can
-- still be set out-of-band the way it is today. Employees were already blocked from
-- touching role by the 0018 profile whitelist; this closes the manager/admin path too.

create or replace function public.enforce_role_change_privileged()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_privileged() then
    raise exception 'Only the owner or developer may change a user role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_change on public.profiles;
create trigger profiles_enforce_role_change before update on public.profiles
  for each row execute function public.enforce_role_change_privileged();

revoke all on function public.enforce_role_change_privileged() from public, anon, authenticated;
