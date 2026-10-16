-- 0095: several parcomètre pictures per parking claim (V2.4.141).
--
-- An employee who fed the meter 2, 3 or more times attaches every receipt. The claim stays ONE row
-- per job (one total amount, one review, same $20/day cap, same costing/payroll reads); the first
-- picture stays in storage_path and the others go in extra_storage_paths (at most 9 more, 10 total).
-- Before this, choosing a second picture replaced the first one, which then became an orphan.

alter table public.parking_receipts
  add column if not exists extra_storage_paths text[] not null default '{}';

alter table public.parking_receipts
  drop constraint if exists parking_receipts_extra_paths_max;
alter table public.parking_receipts
  add constraint parking_receipts_extra_paths_max check (cardinality(extra_storage_paths) <= 9);

comment on column public.parking_receipts.extra_storage_paths is
  'Parcomètre pictures after the first one (storage_path), in the order taken. Same bucket, same owner folder.';

-- Every picture must sit in the claimant's own folder of the parking-receipts bucket (the storage
-- policy only lets an employee upload there), with no duplicates, so a claim can never point at
-- another employee's file.
create or replace function public.validate_parking_receipt_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p text;
begin
  if new.storage_path is null or new.storage_path not like new.user_id::text || '/%' then
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
  before insert or update of storage_path, extra_storage_paths, user_id on public.parking_receipts
  for each row execute function public.validate_parking_receipt_paths();

-- The cleanup worker must not collect the extra pictures as orphans.
create or replace function public.find_orphaned_evidence_objects(p_older_than interval default '02:00:00'::interval, p_limit integer default 500)
returns table(bucket_id text, object_name text)
language sql
security definer
set search_path to 'public', 'storage'
as $function$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('overtime-evidence', 'parking-receipts', 'meal-receipts', 'inventory-screenshots')
    and o.created_at < now() - greatest(p_older_than, interval '1 hour')
    and (
      (o.bucket_id = 'overtime-evidence' and not exists (
        select 1 from public.overtime_evidence e where e.storage_path = o.name
      ))
      or (o.bucket_id = 'parking-receipts' and not exists (
        select 1 from public.parking_receipts p
        where p.storage_path = o.name or o.name = any(p.extra_storage_paths)
      ))
      or (o.bucket_id = 'meal-receipts' and not exists (
        select 1 from public.meal_claims m where m.storage_path = o.name
      ))
      or (o.bucket_id = 'inventory-screenshots' and not exists (
        select 1 from public.inventory_screenshots i where i.storage_path = o.name
      ))
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$function$;
