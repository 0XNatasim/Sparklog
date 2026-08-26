-- =============================================================================
-- 0000_baseline_schema.sql
--
-- Squashed baseline of the SparkLog `public` schema (plus storage buckets and
-- storage policies), captured from the production database. It reproduces the
-- foundational objects that migrations 0001+ assume already exist -- the
-- `profiles` and `jobs` tables, the `get_my_role`/`handle_new_user`/
-- `set_updated_at` functions, the auth signup trigger and the base RLS -- which
-- previously lived only in the production database and in no migration file.
--
-- It is written to be idempotent (create ... if not exists / create or replace /
-- drop ... if exists before create), so it is safe to run against a fresh
-- database and harmless against one that already has this schema.
--
-- See the top-of-repo notes / PR description for how to adopt this baseline
-- (marking it applied on the existing production DB vs. running it on a fresh
-- environment).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Functions (defined before tables/policies/triggers that reference them)
-- -----------------------------------------------------------------------------
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path to 'public' as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, role, full_name, phone, email)
  values (
    new.id,
    'employee',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.enforce_daily_parking_cap()
returns trigger language plpgsql as $$
declare daily_total numeric;
begin
  select coalesce(sum(amount), 0) into daily_total
  from public.parking_receipts
  where user_id = new.user_id and job_date = new.job_date and id <> new.id;
  if daily_total + new.amount > 20 then
    raise exception 'The daily parking maximum is $20';
  end if;
  return new;
end;
$$;

-- Includes the capture-flag guard (originally migration 0032): an update that
-- only toggles the capture flags is bookkeeping on an existing job, not a new
-- or edited time entry, so it is never blocked by the entry deadline.
create or replace function public.enforce_job_entry_window()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  local_now timestamp;
  deadline time;
  has_unlock boolean;
  unchanged public.jobs;
begin
  if public.get_my_role() = 'manager' then return new; end if;

  if tg_op = 'UPDATE' then
    unchanged := new;
    unchanged.parking_receipt_captured := old.parking_receipt_captured;
    unchanged.meal_claim_captured := old.meal_claim_captured;
    unchanged.overtime_evidence_captured := old.overtime_evidence_captured;
    if unchanged is not distinct from old then
      return new;
    end if;
  end if;

  select timezone('America/Toronto', now()) into local_now;
  select daily_deadline into deadline from public.company_time_settings where id = true;
  deadline := coalesce(deadline, '23:59'::time);

  select exists (
    select 1 from public.job_entry_unlocks
    where user_id = auth.uid() and job_date = new.job_date
      and (unlocked_until is null or unlocked_until > now())
  ) into has_unlock;
  if has_unlock then return new; end if;

  if exists (select 1 from public.company_holidays where holiday_date = new.job_date) then
    raise exception 'Jobs cannot be entered for a company holiday';
  end if;

  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;
  return new;
end;
$$;

create or replace function public.notify_overtime_job_edit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  proof public.overtime_evidence%rowtype;
begin
  -- Manager/service-role changes (approval, unlock, maintenance) must not
  -- create employee-edit notifications.
  if auth.uid() is null or auth.uid() <> new.user_id then
    return new;
  end if;

  select * into proof
  from public.overtime_evidence
  where job_id = new.id
  order by created_at desc
  limit 1;

  if proof.id is not null then
    insert into public.manager_notifications (type, employee_id, job_id, evidence_id, daily_minutes)
    values ('overtime_job_edited', new.user_id, new.id, proof.id, proof.daily_minutes);
  end if;

  return new;
end;
$$;

create or replace function public.protect_overtime_evidence_settings()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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

create or replace function public.protect_parking_receipt_setting()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.get_my_role() <> 'manager'
    and new.parking_receipts_enabled is distinct from old.parking_receipts_enabled then
    raise exception 'Only managers can change the parking receipt setting';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables (ordered so foreign-key targets are created first)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text not null default 'employee' check (role in ('employee', 'manager')),
  ccq_number text,
  apprentice_level text,
  sector text not null default 'I' check (sector = 'I'),
  km_rate numeric,
  ccq_card_path text,
  ccq_card_expiry date,
  storage_compensation boolean not null default false,
  overtime_evidence_required boolean not null default true check (overtime_evidence_required = true),
  include_return_time_in_overtime boolean not null default true,
  evidence_retention_days integer not null default 30 check (evidence_retention_days >= 1 and evidence_retention_days <= 365),
  nas_employee text check (nas_employee is null or nas_employee ~ '^[0-9]{9}$'),
  trade_code text not null default '220' check (trade_code = '220'),
  work_region text check (work_region is null or work_region ~ '^[0-9]{2}$'),
  wage_schedule text,
  hourly_rate numeric check (hourly_rate is null or hourly_rate >= 0),
  is_paused boolean not null default false,
  union_association text check (union_association is null or union_association in ('CSD', 'CSN', 'CPQMCI', 'FTQ', 'SQC')),
  parking_receipts_enabled boolean not null default false,
  birth_date date,
  ccq_expiration_date date
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  ot text,
  depart time,
  arrivee time,
  fin time,
  km_aller numeric default 0,
  status text not null default 'saved' check (status in ('saved', 'updated', 'submitted', 'approved')),
  locked boolean not null default false,
  exported_to_sheet boolean not null default false,
  exported_at timestamptz,
  exported_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  return_time_minutes integer not null default 0 check (return_time_minutes >= 0 and return_time_minutes <= 240 and return_time_minutes % 15 = 0),
  km_retour numeric not null default 0 check (km_retour >= 0),
  overtime_evidence_captured boolean not null default false,
  parking_receipt_captured boolean not null default false,
  km_total numeric not null default 0 check (km_total >= 0),
  meal_claim_captured boolean not null default false
);
create index if not exists jobs_status_date_idx on public.jobs (status, job_date desc);
create index if not exists jobs_user_date_idx on public.jobs (user_id, job_date desc);

create table if not exists public.employee_forms (
  form_id text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_form_access (
  form_id text not null references public.employee_forms(form_id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (form_id, employee_id)
);

create table if not exists public.job_entry_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  unlocked_until timestamptz,
  reason text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, job_date)
);

create table if not exists public.overtime_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  storage_path text not null,
  ocr_text text,
  ocr_status text not null default 'needs_review' check (ocr_status in ('pending', 'processed', 'needs_review', 'failed')),
  daily_minutes integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.meal_claims (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  amount numeric not null default 30 check (amount = 30),
  storage_path text,
  daily_work_minutes integer not null check (daily_work_minutes >= 615),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  payroll_treatment text check (payroll_treatment in ('expense_reimbursement', 'taxable_benefit')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, job_date)
);

create table if not exists public.parking_receipts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);

create table if not exists public.manager_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'overtime_evidence',
  employee_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  evidence_id uuid references public.overtime_evidence(id) on delete cascade,
  daily_minutes integer not null,
  created_at timestamptz not null default now(),
  meal_claim_id uuid references public.meal_claims(id) on delete cascade,
  parking_receipt_id uuid references public.parking_receipts(id) on delete cascade
);

create table if not exists public.manager_notification_reads (
  notification_id uuid not null references public.manager_notifications(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, manager_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete set null,
  sender_name text,
  channel text not null default 'sms',
  body text not null,
  recipient_count integer not null default 0,
  segment_count integer not null default 1,
  provider text,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists messages_created_idx on public.messages (created_at desc);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete set null,
  name text,
  phone text,
  delivery_status text not null default 'queued',
  provider_sid text,
  error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists message_recipients_employee_idx on public.message_recipients (employee_id);
create index if not exists message_recipients_message_idx on public.message_recipients (message_id);

create table if not exists public.company_holidays (
  holiday_date date primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_time_settings (
  id boolean primary key default true check (id = true),
  timezone text not null default 'America/Toronto' check (timezone = 'America/Toronto'),
  daily_deadline time not null default '23:59:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.overtime_settings (
  id boolean primary key default true check (id = true),
  evidence_retention_days integer not null default 30 check (evidence_retention_days >= 1 and evidence_retention_days <= 365),
  updated_at timestamptz not null default now()
);

create table if not exists public.ccq_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  occupation_id text not null,
  occupation_name text,
  sector_id text not null,
  sector_name text,
  skill_id text not null,
  skill_name text,
  annex_id text not null default 'ALL',
  rates_to_date date not null,
  source_url text not null,
  raw_json jsonb not null,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ccq_snapshots_lookup_idx on public.ccq_rate_snapshots (occupation_id, sector_id, skill_id, rates_to_date, fetched_at desc);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_enforce_entry_window on public.jobs;
create trigger jobs_enforce_entry_window before insert or update on public.jobs
  for each row execute function public.enforce_job_entry_window();

drop trigger if exists jobs_notify_overtime_edit on public.jobs;
create trigger jobs_notify_overtime_edit after update of job_date, ot, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes, status on public.jobs
  for each row execute function public.notify_overtime_job_edit();

drop trigger if exists parking_receipts_daily_cap on public.parking_receipts;
create trigger parking_receipts_daily_cap before insert or update of amount, user_id, job_date on public.parking_receipts
  for each row execute function public.enforce_daily_parking_cap();

drop trigger if exists profiles_protect_overtime_evidence_settings on public.profiles;
create trigger profiles_protect_overtime_evidence_settings before update on public.profiles
  for each row execute function public.protect_overtime_evidence_settings();

drop trigger if exists profiles_protect_parking_receipt_setting on public.profiles;
create trigger profiles_protect_parking_receipt_setting before update on public.profiles
  for each row execute function public.protect_parking_receipt_setting();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.employee_forms enable row level security;
alter table public.employee_form_access enable row level security;
alter table public.job_entry_unlocks enable row level security;
alter table public.overtime_evidence enable row level security;
alter table public.meal_claims enable row level security;
alter table public.parking_receipts enable row level security;
alter table public.manager_notifications enable row level security;
alter table public.manager_notification_reads enable row level security;
alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;
alter table public.company_holidays enable row level security;
alter table public.company_time_settings enable row level security;
alter table public.overtime_settings enable row level security;
alter table public.ccq_rate_snapshots enable row level security;

-- profiles
drop policy if exists "profiles: own read" on public.profiles;
create policy "profiles: own read" on public.profiles for select to public using (auth.uid() = id);
drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update" on public.profiles for update to public using (auth.uid() = id);
drop policy if exists "profiles: manager read all" on public.profiles;
create policy "profiles: manager read all" on public.profiles for select to public using (get_my_role() = 'manager');
drop policy if exists "profiles: manager update all" on public.profiles;
create policy "profiles: manager update all" on public.profiles for update to public using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- jobs (current, status-scoped employee + manager policies)
drop policy if exists "jobs: employee insert own" on public.jobs;
create policy "jobs: employee insert own" on public.jobs for insert to authenticated
  with check (user_id = auth.uid() and ((status = 'saved' and locked = false) or (status = 'submitted' and locked = true)));
drop policy if exists "jobs: employee read own" on public.jobs;
create policy "jobs: employee read own" on public.jobs for select to authenticated using (user_id = auth.uid());
drop policy if exists "jobs: employee update own editable" on public.jobs;
create policy "jobs: employee update own editable" on public.jobs for update to authenticated
  using (user_id = auth.uid() and locked = false and status in ('saved', 'updated'))
  with check (user_id = auth.uid() and ((status in ('saved', 'updated') and locked = false) or (status = 'submitted' and locked = true)));
drop policy if exists "jobs: employee delete own editable" on public.jobs;
create policy "jobs: employee delete own editable" on public.jobs for delete to authenticated
  using (user_id = auth.uid() and locked = false and status in ('saved', 'updated'));
drop policy if exists "jobs: manager insert" on public.jobs;
create policy "jobs: manager insert" on public.jobs for insert to public with check (get_my_role() = 'manager');
drop policy if exists "jobs: manager read all" on public.jobs;
create policy "jobs: manager read all" on public.jobs for select to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'));
drop policy if exists "jobs: manager update all" on public.jobs;
create policy "jobs: manager update all" on public.jobs for update to public using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- NOTE: production currently also carries legacy job policies ("jobs: own insert",
-- "jobs: own read", "jobs: own update unlocked", "jobs: own delete unlocked").
-- They predate and are superseded by the status-scoped "jobs: employee *" policies
-- above and are intentionally omitted from this baseline. See the cleanup step in
-- the PR notes if you want to drop them from the live database too.

-- employee_forms / employee_form_access
drop policy if exists "employee_forms: authenticated read" on public.employee_forms;
create policy "employee_forms: authenticated read" on public.employee_forms for select to authenticated using (true);
drop policy if exists "employee_forms: manager update" on public.employee_forms;
create policy "employee_forms: manager update" on public.employee_forms for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');
drop policy if exists "employee form access: employee read own" on public.employee_form_access;
create policy "employee form access: employee read own" on public.employee_form_access for select to authenticated using (employee_id = auth.uid());
drop policy if exists "employee form access: manager read" on public.employee_form_access;
create policy "employee form access: manager read" on public.employee_form_access for select to authenticated using (get_my_role() = 'manager');
drop policy if exists "employee form access: manager insert" on public.employee_form_access;
create policy "employee form access: manager insert" on public.employee_form_access for insert to authenticated with check (get_my_role() = 'manager');
drop policy if exists "employee form access: manager delete" on public.employee_form_access;
create policy "employee form access: manager delete" on public.employee_form_access for delete to authenticated using (get_my_role() = 'manager');

-- job_entry_unlocks
drop policy if exists "unlocks: employee read own" on public.job_entry_unlocks;
create policy "unlocks: employee read own" on public.job_entry_unlocks for select to authenticated using (user_id = auth.uid() or get_my_role() = 'manager');
drop policy if exists "unlocks: manager manage" on public.job_entry_unlocks;
create policy "unlocks: manager manage" on public.job_entry_unlocks for all to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- overtime_evidence
drop policy if exists "overtime evidence: employee insert" on public.overtime_evidence;
create policy "overtime evidence: employee insert" on public.overtime_evidence for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "overtime evidence: manager read" on public.overtime_evidence;
create policy "overtime evidence: manager read" on public.overtime_evidence for select to authenticated using (get_my_role() = 'manager');

-- meal_claims
drop policy if exists "meal claims: employee insert" on public.meal_claims;
create policy "meal claims: employee insert" on public.meal_claims for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "meal claims: employee read own" on public.meal_claims;
create policy "meal claims: employee read own" on public.meal_claims for select to authenticated using (user_id = auth.uid());
drop policy if exists "meal claims: manager read" on public.meal_claims;
create policy "meal claims: manager read" on public.meal_claims for select to authenticated using (get_my_role() = 'manager');
drop policy if exists "meal claims: manager update" on public.meal_claims;
create policy "meal claims: manager update" on public.meal_claims for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- parking_receipts
drop policy if exists "parking receipts: employee insert" on public.parking_receipts;
create policy "parking receipts: employee insert" on public.parking_receipts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "parking receipts: employee read own" on public.parking_receipts;
create policy "parking receipts: employee read own" on public.parking_receipts for select to authenticated using (user_id = auth.uid());
drop policy if exists "parking receipts: employee update" on public.parking_receipts;
create policy "parking receipts: employee update" on public.parking_receipts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "parking receipts: manager read" on public.parking_receipts;
create policy "parking receipts: manager read" on public.parking_receipts for select to authenticated using (get_my_role() = 'manager');
drop policy if exists "parking receipts: manager update" on public.parking_receipts;
create policy "parking receipts: manager update" on public.parking_receipts for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- manager_notifications / reads
drop policy if exists "notifications: employee insert" on public.manager_notifications;
create policy "notifications: employee insert" on public.manager_notifications for insert to authenticated
  with check (employee_id = auth.uid() and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));
drop policy if exists "notifications: manager read" on public.manager_notifications;
create policy "notifications: manager read" on public.manager_notifications for select to authenticated using (get_my_role() = 'manager');
drop policy if exists "notification reads: manager manage own" on public.manager_notification_reads;
create policy "notification reads: manager manage own" on public.manager_notification_reads for all to authenticated
  using (manager_id = auth.uid() and get_my_role() = 'manager') with check (manager_id = auth.uid() and get_my_role() = 'manager');

-- messages / message_recipients
drop policy if exists "messages: manager read" on public.messages;
create policy "messages: manager read" on public.messages for select to public using (get_my_role() = 'manager');
drop policy if exists "message_recipients: manager read" on public.message_recipients;
create policy "message_recipients: manager read" on public.message_recipients for select to public using (get_my_role() = 'manager');

-- company settings / holidays
drop policy if exists "holidays: authenticated read" on public.company_holidays;
create policy "holidays: authenticated read" on public.company_holidays for select to authenticated using (true);
drop policy if exists "time settings: authenticated read" on public.company_time_settings;
create policy "time settings: authenticated read" on public.company_time_settings for select to authenticated using (true);
drop policy if exists "time settings: manager update" on public.company_time_settings;
create policy "time settings: manager update" on public.company_time_settings for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');
drop policy if exists "overtime settings: authenticated read" on public.overtime_settings;
create policy "overtime settings: authenticated read" on public.overtime_settings for select to authenticated using (true);
drop policy if exists "overtime settings: manager update" on public.overtime_settings;
create policy "overtime settings: manager update" on public.overtime_settings for update to authenticated using (get_my_role() = 'manager') with check (get_my_role() = 'manager');

-- ccq_rate_snapshots
drop policy if exists "ccq_rate_snapshots: manager read" on public.ccq_rate_snapshots;
create policy "ccq_rate_snapshots: manager read" on public.ccq_rate_snapshots for select to public using (get_my_role() = 'manager');
drop policy if exists "ccq_rate_snapshots: service insert" on public.ccq_rate_snapshots;
create policy "ccq_rate_snapshots: service insert" on public.ccq_rate_snapshots for insert to public with check (true);

-- Singleton settings rows.
insert into public.company_time_settings (id) values (true) on conflict (id) do nothing;
insert into public.overtime_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Storage buckets and policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('ccq-cards', 'ccq-cards', false),
  ('overtime-evidence', 'overtime-evidence', false),
  ('parking-receipts', 'parking-receipts', false),
  ('meal-receipts', 'meal-receipts', false)
on conflict (id) do nothing;

drop policy if exists "ccq cards: own read" on storage.objects;
create policy "ccq cards: own read" on storage.objects for select to public
  using (bucket_id = 'ccq-cards' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "ccq cards: manager all" on storage.objects;
create policy "ccq cards: manager all" on storage.objects for all to public
  using (bucket_id = 'ccq-cards' and get_my_role() = 'manager')
  with check (bucket_id = 'ccq-cards' and get_my_role() = 'manager');

drop policy if exists "overtime storage: employee upload" on storage.objects;
create policy "overtime storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'overtime-evidence' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "overtime storage: manager read" on storage.objects;
create policy "overtime storage: manager read" on storage.objects for select to authenticated
  using (bucket_id = 'overtime-evidence' and get_my_role() = 'manager');

drop policy if exists "parking storage: employee upload" on storage.objects;
create policy "parking storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'parking-receipts' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "parking storage: manager read" on storage.objects;
create policy "parking storage: manager read" on storage.objects for select to authenticated
  using (bucket_id = 'parking-receipts' and get_my_role() = 'manager');

drop policy if exists "meal storage: employee upload" on storage.objects;
create policy "meal storage: employee upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-receipts' and (storage.foldername(name))[1] = (auth.uid())::text);
drop policy if exists "meal storage: manager read" on storage.objects;
create policy "meal storage: manager read" on storage.objects for select to authenticated
  using (bucket_id = 'meal-receipts' and get_my_role() = 'manager');
