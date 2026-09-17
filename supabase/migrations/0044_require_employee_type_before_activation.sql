-- 0043: an employee's TYPE must be chosen before the account can be activated.
--
-- New signups register with role 'employee' and is_paused = true (0004). Because the
-- default role is a valid type, there is no way to tell "someone deliberately picked
-- Employé (CCQ)" from "nobody has chosen yet". This adds an explicit flag so the panel
-- can force the privileged user to pick Administration or Employé (CCQ) FIRST, and only
-- then allow activation (is_paused -> false).
--
-- The flag does not gate any RLS: picking the type sets role, which is already
-- owner-only (0031/0032). type_confirmed is a UI-facing marker written alongside.
alter table public.profiles
  add column if not exists type_confirmed boolean not null default false;

-- Existing accounts already have a working type; the gate is only for brand-new signups.
update public.profiles set type_confirmed = true where type_confirmed = false;

-- New signups register unconfirmed so the panel blocks activation until a type is chosen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, role, full_name, phone, email, is_paused, type_confirmed)
  values (
    new.id,
    'employee',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    true,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
