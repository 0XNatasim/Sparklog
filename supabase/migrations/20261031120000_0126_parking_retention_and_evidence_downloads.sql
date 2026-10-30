-- 0126: parking receipt pictures expire like the overtime proofs, and « Télécharger les justificatifs » (V2.4.209).
--
-- 1. The pictures of a parking claim are kept for the SAME number of days as the overtime screenshots
--    (overtime_settings.evidence_retention_days, set by the owner, 30 by default). The claim itself (amount, review,
--    job) stays: payroll and costing read the amount for good. Only the pictures go: the cleanup worker removes the
--    objects, then empties storage_path / extra_storage_paths and stamps pictures_purged_at.
-- 2. evidence_downloads remembers which pictures a manager already downloaded (shared by every manager and every
--    device), so downloading a week again, or a longer period, only brings the pictures not downloaded yet.
--    Downloading never removes anything from the app: the pictures stay until their retention ends.

alter table public.parking_receipts
  add column if not exists expires_at timestamptz,
  add column if not exists pictures_purged_at timestamptz;

alter table public.parking_receipts alter column storage_path drop not null;

-- Existing claims: same expiry as if they had been saved with today's retention.
update public.parking_receipts p
set expires_at = p.created_at + make_interval(days => least(365, greatest(1, coalesce(
  (select o.evidence_retention_days from public.overtime_settings o where o.id = true), 30))))
where p.expires_at is null;

create index if not exists parking_receipts_expiry_idx on public.parking_receipts (expires_at) where storage_path is not null;

-- Server-owned: the expiry starts when the pictures arrive; an employee cannot move it or fake a purge.
create or replace function public.parking_receipts_set_expiry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  retention integer;
begin
  select coalesce(o.evidence_retention_days, 30) into retention from public.overtime_settings o where o.id = true;
  retention := least(365, greatest(1, coalesce(retention, 30)));
  if tg_op = 'INSERT' then
    new.pictures_purged_at := null;
    new.expires_at := now() + make_interval(days => retention);
  elsif auth.uid() is not null then
    new.expires_at := old.expires_at;
    new.pictures_purged_at := old.pictures_purged_at;
    -- Pictures added again after a purge start a new window.
    if old.storage_path is null and new.storage_path is not null then
      new.pictures_purged_at := null;
      new.expires_at := now() + make_interval(days => retention);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_receipts_set_expiry on public.parking_receipts;
create trigger parking_receipts_set_expiry before insert or update on public.parking_receipts
  for each row execute function public.parking_receipts_set_expiry();
revoke all on function public.parking_receipts_set_expiry() from public, anon, authenticated;

-- A purged claim has no pictures at all; any other claim keeps the rules of 0095.
create or replace function public.validate_parking_receipt_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p text;
begin
  if new.storage_path is null then
    if new.pictures_purged_at is null or cardinality(coalesce(new.extra_storage_paths, '{}')) > 0 then
      raise exception 'Parking receipt picture must be in the employee''s own folder' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.storage_path not like new.user_id::text || '/%' then
    raise exception 'Parking receipt picture must be in the employee''s own folder' using errcode = 'check_violation';
  end if;
  foreach p in array coalesce(new.extra_storage_paths, '{}') loop
    if p is null or p not like new.user_id::text || '/%' or p = new.storage_path then
      raise exception 'Parking receipt picture must be in the employee''s own folder' using errcode = 'check_violation';
    end if;
  end loop;
  if cardinality(new.extra_storage_paths) <> (select count(distinct x) from unnest(new.extra_storage_paths) x) then
    raise exception 'Duplicate parking receipt picture' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_receipts_validate_paths on public.parking_receipts;
create trigger parking_receipts_validate_paths
  before insert or update of storage_path, extra_storage_paths, user_id, pictures_purged_at on public.parking_receipts
  for each row execute function public.validate_parking_receipt_paths();

-- Pictures already downloaded by a manager.
create table if not exists public.evidence_downloads (
  bucket text not null check (bucket in ('overtime-evidence', 'parking-receipts')),
  storage_path text not null,
  downloaded_by uuid not null default auth.uid(),
  downloaded_at timestamptz not null default now(),
  primary key (bucket, storage_path)
);

alter table public.evidence_downloads enable row level security;

drop policy if exists "evidence_downloads: managers read" on public.evidence_downloads;
drop policy if exists "evidence_downloads: managers insert" on public.evidence_downloads;
create policy "evidence_downloads: managers read" on public.evidence_downloads
  for select to authenticated using (public.get_my_role() = 'manager');
create policy "evidence_downloads: managers insert" on public.evidence_downloads
  for insert to authenticated with check (public.get_my_role() = 'manager');

-- Written once, never edited or deleted by the browser (the cleanup worker drops a mark with its picture).
revoke all on public.evidence_downloads from anon, public, authenticated;
grant select, insert on public.evidence_downloads to authenticated;

create or replace function public.evidence_downloads_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.downloaded_by := auth.uid();
  new.downloaded_at := now();
  return new;
end;
$$;

drop trigger if exists evidence_downloads_guard on public.evidence_downloads;
create trigger evidence_downloads_guard before insert on public.evidence_downloads
  for each row execute function public.evidence_downloads_guard();
revoke all on function public.evidence_downloads_guard() from public, anon, authenticated;
