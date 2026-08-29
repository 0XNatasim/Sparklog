-- New employees register as inactive (paused). A manager must activate them
-- (toggle is_paused off) before their first day of work.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, role, full_name, phone, email, is_paused)
  values (
    new.id,
    'employee',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
