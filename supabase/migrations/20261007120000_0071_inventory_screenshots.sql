-- 0071: end-of-shift inventory screenshots.
-- Each employee captures three screenshots of the Field Service inventory at the end of
-- their last work order of the day. They are stored per (employee, day, slot) in a private
-- bucket, readable by the employee and by manager-tier roles, and are required before any
-- of the day's jobs can be submitted (office staff exempt). Retention reuses the overtime
-- proof retention window; the cleanup worker removes expired rows and orphaned objects.

create table if not exists public.inventory_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  slot smallint not null check (slot between 1 and 3),
  storage_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, job_date, slot)
);
create index if not exists inventory_screenshots_expires_at_idx on public.inventory_screenshots (expires_at);
create index if not exists inventory_screenshots_date_idx on public.inventory_screenshots (job_date, user_id);

alter table public.inventory_screenshots enable row level security;

drop policy if exists "inventory screenshots: owner read" on public.inventory_screenshots;
create policy "inventory screenshots: owner read" on public.inventory_screenshots
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "inventory screenshots: manager read" on public.inventory_screenshots;
create policy "inventory screenshots: manager read" on public.inventory_screenshots
  for select to authenticated using ((select public.get_my_role()) = 'manager');
drop policy if exists "inventory screenshots: owner insert" on public.inventory_screenshots;
create policy "inventory screenshots: owner insert" on public.inventory_screenshots
  for insert to authenticated with check (public.is_not_paused() and user_id = (select auth.uid()));
drop policy if exists "inventory screenshots: owner update" on public.inventory_screenshots;
create policy "inventory screenshots: owner update" on public.inventory_screenshots
  for update to authenticated
  using (public.is_not_paused() and user_id = (select auth.uid()))
  with check (public.is_not_paused() and user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-screenshots', 'inventory-screenshots', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inventory storage: owner upload" on storage.objects;
create policy "inventory storage: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-screenshots' and public.is_not_paused()
              and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "inventory storage: owner read" on storage.objects;
create policy "inventory storage: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'inventory-screenshots' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "inventory storage: owner delete" on storage.objects;
create policy "inventory storage: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'inventory-screenshots' and public.is_not_paused()
         and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "inventory storage: manager read" on storage.objects;
create policy "inventory storage: manager read" on storage.objects for select to authenticated
  using (bucket_id = 'inventory-screenshots' and (select public.get_my_role()) = 'manager');

-- Orphan reconciliation now also covers the inventory bucket.
create or replace function public.find_orphaned_evidence_objects(
  p_older_than interval default interval '2 hours',
  p_limit integer default 500
)
returns table (bucket_id text, object_name text)
language sql security definer set search_path to 'public', 'storage' as $function$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('overtime-evidence', 'parking-receipts', 'meal-receipts', 'inventory-screenshots')
    and o.created_at < now() - greatest(p_older_than, interval '1 hour')
    and (
      (o.bucket_id = 'overtime-evidence' and not exists (
        select 1 from public.overtime_evidence e where e.storage_path = o.name
      ))
      or (o.bucket_id = 'parking-receipts' and not exists (
        select 1 from public.parking_receipts p where p.storage_path = o.name
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

revoke all on function public.find_orphaned_evidence_objects(interval, integer) from public, anon, authenticated;
grant execute on function public.find_orphaned_evidence_objects(interval, integer) to service_role;

-- Submission gate (replaces the 0069 body; the only change is the inventory block).
create or replace function public.validate_job_submission_contract()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  duration_minutes integer;
  other_minutes integer;
  day_has_evidence boolean;
  is_office_employee boolean;
begin
  if new.status <> 'submitted' then return new; end if;
  if tg_op = 'UPDATE' and old.status not in ('saved', 'updated') then return new; end if;
  if new.started_at is null or new.ended_at is null then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;
  duration_minutes := extract(epoch from (new.ended_at - new.started_at))::integer / 60;
  if duration_minutes <= 0 or duration_minutes > 960 then
    raise exception using errcode = '23514', message = 'invalid_job_interval';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select coalesce(p.role = 'admin', false) into is_office_employee
  from public.profiles p where p.id = new.user_id;
  select
    coalesce(sum(case
      when j.started_at is not null and j.ended_at is not null
        then extract(epoch from (j.ended_at - j.started_at))::integer / 60
      when j.depart is not null and j.fin is not null
        then (extract(epoch from (j.fin - j.depart))::integer / 60 + 1440) % 1440
      else 0
    end), 0)::integer,
    coalesce(bool_or(j.overtime_evidence_captured), false)
  into other_minutes, day_has_evidence
  from public.jobs j
  where j.user_id = new.user_id
    and j.job_date = new.job_date
    and j.id <> new.id
    and j.status in ('saved', 'updated', 'submitted', 'approved');

  if not coalesce(is_office_employee, false)
     and duration_minutes + other_minutes > 480
     and not (coalesce(new.overtime_evidence_captured, false) or day_has_evidence) then
    raise exception using errcode = '23514', message = 'overtime_evidence_required';
  end if;

  -- End-of-shift inventory: the day must carry all three Field Service inventory
  -- screenshots (office staff are exempt, and days before the rollout date are grandfathered).
  if not coalesce(is_office_employee, false)
     and new.job_date >= date '2026-10-08'
     and (select count(distinct s.slot) from public.inventory_screenshots s
          where s.user_id = new.user_id and s.job_date = new.job_date) < 3 then
    raise exception using errcode = '23514', message = 'inventory_screenshots_required';
  end if;

  if exists (
    select 1 from public.jobs j
    where j.user_id = new.user_id
      and j.id <> new.id
      and j.status in ('submitted', 'approved')
      and j.started_at is not null and j.ended_at is not null
      and tstzrange(j.started_at, j.ended_at, '[)')
          && tstzrange(new.started_at, new.ended_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'overlapping_job_interval';
  end if;
  if new.return_time_minutes > duration_minutes then
    raise exception using errcode = '23514', message = 'return_time_exceeds_job_interval';
  end if;
  if new.km_total is null or new.km_aller is null or new.km_retour is null
     or new.km_total < 0 or new.km_aller < 0 or new.km_retour < 0
     or new.km_retour > new.km_total
     or abs((new.km_aller + new.km_retour) - new.km_total) > 0.001 then
    raise exception using errcode = '23514', message = 'invalid_job_kilometres';
  end if;
  return new;
end;
$function$;
