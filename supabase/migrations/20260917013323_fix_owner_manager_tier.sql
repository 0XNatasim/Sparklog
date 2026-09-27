-- 0043: restore the owner -> manager authorization collapse.
--
-- Migration 0042 rewrote get_my_role() to map admin -> employee, but in doing so it
-- dropped the owner -> manager mapping that 0032 established. That left the owner
-- returning 'owner' from get_my_role(), which matches NONE of the manager-tier RLS
-- policies (they all test get_my_role() = 'manager'): the owner silently lost the
-- dashboard, read-all-profiles, approvals and every other manager-gated capability.
--
-- Fix: keep 0042's admin -> employee mapping AND re-add owner -> manager, so:
--   admin    -> employee  (office employee, own-data only; 0042)
--   owner    -> manager   (manager-tier + privileged via is_privileged(); 0032)
--   manager  -> manager
--   employee -> employee
-- my_actual_role() still exposes the untouched value for pay-basis / label logic.
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select case
           when role = 'admin' then 'employee'
           when role = 'owner' then 'manager'
           else role
         end
    from public.profiles where id = auth.uid();
$$;
