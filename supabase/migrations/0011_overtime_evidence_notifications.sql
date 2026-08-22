alter table public.profiles
  add column if not exists overtime_evidence_required boolean not null default true,
  add column if not exists include_return_time_in_overtime boolean not null default true,
  add column if not exists evidence_retention_days integer not null default 30;

alter table public.profiles
  drop constraint if exists profiles_evidence_retention_days_check,
  add constraint profiles_evidence_retention_days_check check (evidence_retention_days between 1 and 365);

create or replace function public.protect_overtime_evidence_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'manager' and (
    new.overtime_evidence_required is distinct from old.overtime_evidence_required
    or new.include_return_time_in_overtime is distinct from old.include_return_time_in_overtime
    or new.evidence_retention_days is distinct from old.evidence_retention_days
  ) then
    raise exception 'Only managers can change overtime evidence settings';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_overtime_evidence_settings on public.profiles;
create trigger profiles_protect_overtime_evidence_settings
before update on public.profiles
for each row execute function public.protect_overtime_evidence_settings();

alter table public.jobs
  add column if not exists overtime_evidence_captured boolean not null default false;

create table if not exists public.overtime_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  storage_path text not null,
  ocr_text text,
  ocr_status text not null default 'needs_review' check (ocr_status in ('processed', 'needs_review', 'failed')),
  daily_minutes integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.manager_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'overtime_evidence',
  employee_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  evidence_id uuid not null references public.overtime_evidence(id) on delete cascade,
  daily_minutes integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.manager_notification_reads (
  notification_id uuid not null references public.manager_notifications(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, manager_id)
);

alter table public.overtime_evidence enable row level security;
alter table public.manager_notifications enable row level security;
alter table public.manager_notification_reads enable row level security;

drop policy if exists "overtime evidence: employee insert" on public.overtime_evidence;
create policy "overtime evidence: employee insert"
  on public.overtime_evidence for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid())
  );
drop policy if exists "overtime evidence: manager read" on public.overtime_evidence;
create policy "overtime evidence: manager read"
  on public.overtime_evidence for select to authenticated
  using (public.get_my_role() = 'manager');
drop policy if exists "notifications: employee insert" on public.manager_notifications;
create policy "notifications: employee insert"
  on public.manager_notifications for insert to authenticated
  with check (
    employee_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid())
  );
drop policy if exists "notifications: manager read" on public.manager_notifications;
create policy "notifications: manager read"
  on public.manager_notifications for select to authenticated
  using (public.get_my_role() = 'manager');
drop policy if exists "notification reads: manager manage own" on public.manager_notification_reads;
create policy "notification reads: manager manage own"
  on public.manager_notification_reads for all to authenticated
  using (manager_id = auth.uid() and public.get_my_role() = 'manager')
  with check (manager_id = auth.uid() and public.get_my_role() = 'manager');

insert into storage.buckets (id, name, public)
values ('overtime-evidence', 'overtime-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists "overtime storage: employee upload" on storage.objects;
create policy "overtime storage: employee upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'overtime-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "overtime storage: manager read" on storage.objects;
create policy "overtime storage: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'overtime-evidence' and public.get_my_role() = 'manager');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'manager_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.manager_notifications';
  end if;
end $$;
