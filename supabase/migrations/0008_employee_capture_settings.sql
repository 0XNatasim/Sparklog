-- Phase 1 of manager-configurable employee data capture.
--
-- Adds global on/off settings (CCQ card photo, birth date, union association)
-- with optional per-employee overrides, storage for the latest CCQ card image,
-- and bookkeeping columns used later for 60/30-day renewal reminders.

-- Global defaults (singleton row, like company_time_settings / overtime_settings).
create table if not exists public.company_capture_settings (
  id boolean primary key default true check (id = true),
  ccq_card_enabled boolean not null default false,
  birth_date_enabled boolean not null default false,
  union_association_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.company_capture_settings (id) values (true) on conflict (id) do nothing;

alter table public.company_capture_settings enable row level security;
drop policy if exists "capture settings: authenticated read" on public.company_capture_settings;
create policy "capture settings: authenticated read" on public.company_capture_settings
  for select to authenticated using (true);
drop policy if exists "capture settings: manager update" on public.company_capture_settings;
create policy "capture settings: manager update" on public.company_capture_settings
  for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- Per-employee overrides (null = inherit the global default), the latest CCQ
-- card image path, and per-expiration renewal-reminder markers.
alter table public.profiles
  add column if not exists ccq_card_capture_enabled boolean,
  add column if not exists birth_date_capture_enabled boolean,
  add column if not exists union_association_capture_enabled boolean,
  add column if not exists ccq_card_path text,
  add column if not exists ccq_card_captured_at timestamptz,
  add column if not exists ccq_renewal_60_sent_for date,
  add column if not exists ccq_renewal_30_sent_for date;

-- Employees must not flip their own capture requirements; managers only.
create or replace function public.protect_capture_overrides()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.get_my_role() <> 'manager' and (
      new.ccq_card_capture_enabled is distinct from old.ccq_card_capture_enabled
      or new.birth_date_capture_enabled is distinct from old.birth_date_capture_enabled
      or new.union_association_capture_enabled is distinct from old.union_association_capture_enabled
  ) then
    raise exception 'Only managers can change capture settings';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_capture_overrides on public.profiles;
create trigger profiles_protect_capture_overrides before update on public.profiles
  for each row execute function public.protect_capture_overrides();
revoke all on function public.protect_capture_overrides() from public, anon, authenticated;

-- The ccq-cards bucket already exists with read policies; allow employees to
-- upload their own card image (folder = their user id).
drop policy if exists "ccq cards: employee upload" on storage.objects;
create policy "ccq cards: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ccq-cards' and (storage.foldername(name))[1] = (auth.uid())::text);
