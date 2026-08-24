alter table public.profiles
  add column if not exists parking_receipts_enabled boolean not null default false;

create or replace function public.protect_parking_receipt_setting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'manager'
    and new.parking_receipts_enabled is distinct from old.parking_receipts_enabled then
    raise exception 'Only managers can change the parking receipt setting';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_parking_receipt_setting on public.profiles;
create trigger profiles_protect_parking_receipt_setting
before update on public.profiles
for each row execute function public.protect_parking_receipt_setting();
