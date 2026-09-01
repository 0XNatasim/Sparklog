-- Keep each auth user's dashboard "Display name" in sync with their profile
-- full_name, so the Supabase Authentication > Users list stays readable as
-- employees are added or renamed (the app itself never reads this field).

create or replace function public.sync_auth_display_name()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.full_name is not null and btrim(new.full_name) <> '' then
    update auth.users
      set raw_user_meta_data =
            coalesce(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('display_name', new.full_name)
      where id = new.id
        and coalesce(raw_user_meta_data ->> 'display_name', '') is distinct from new.full_name;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_auth_display_name on public.profiles;
create trigger profiles_sync_auth_display_name
  after insert or update of full_name on public.profiles
  for each row execute function public.sync_auth_display_name();

revoke all on function public.sync_auth_display_name() from public, anon, authenticated;
