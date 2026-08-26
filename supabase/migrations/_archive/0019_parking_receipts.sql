alter table public.jobs
  add column if not exists parking_receipt_captured boolean not null default false;

create table if not exists public.parking_receipts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.parking_receipts enable row level security;

drop policy if exists "parking receipts: employee insert" on public.parking_receipts;
create policy "parking receipts: employee insert"
  on public.parking_receipts for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid())
  );

drop policy if exists "parking receipts: employee update" on public.parking_receipts;
create policy "parking receipts: employee update"
  on public.parking_receipts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "parking receipts: manager read" on public.parking_receipts;
create policy "parking receipts: manager read"
  on public.parking_receipts for select to authenticated
  using (public.get_my_role() = 'manager');

insert into storage.buckets (id, name, public)
values ('parking-receipts', 'parking-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "parking storage: employee upload" on storage.objects;
create policy "parking storage: employee upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'parking-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "parking storage: manager read" on storage.objects;
create policy "parking storage: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'parking-receipts' and public.get_my_role() = 'manager');
