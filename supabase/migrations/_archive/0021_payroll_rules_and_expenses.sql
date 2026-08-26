-- Confirmed payroll/expense rules. General travel-rate conversion remains deferred.

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists ccq_expiration_date date;

alter table public.jobs
  add column if not exists km_total numeric not null default 0 check (km_total >= 0),
  add column if not exists meal_claim_captured boolean not null default false;

-- Existing km_aller values represented the scanned/manual total before the return
-- breakdown was introduced.
update public.jobs
set km_total = greatest(coalesce(km_total, 0), coalesce(km_aller, 0) + coalesce(km_retour, 0))
where km_total = 0;

alter table public.parking_receipts
  add column if not exists amount numeric(8,2) not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  drop constraint if exists parking_receipts_amount_nonnegative,
  add constraint parking_receipts_amount_nonnegative check (amount >= 0),
  drop constraint if exists parking_receipts_status_check,
  add constraint parking_receipts_status_check check (status in ('pending', 'approved', 'rejected'));

create table if not exists public.company_time_settings (
  id boolean primary key default true check (id = true),
  timezone text not null default 'America/Toronto' check (timezone = 'America/Toronto'),
  daily_deadline time not null default '23:59',
  updated_at timestamptz not null default now()
);

insert into public.company_time_settings (id) values (true)
on conflict (id) do nothing;

create table if not exists public.company_holidays (
  holiday_date date primary key,
  label text not null,
  created_at timestamptz not null default now()
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

create table if not exists public.meal_claims (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_date date not null,
  amount numeric(8,2) not null default 30 check (amount = 30),
  storage_path text not null,
  daily_work_minutes integer not null check (daily_work_minutes >= 615),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  payroll_treatment text check (payroll_treatment in ('expense_reimbursement', 'taxable_benefit')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, job_date)
);

alter table public.manager_notifications
  alter column evidence_id drop not null,
  add column if not exists meal_claim_id uuid references public.meal_claims(id) on delete cascade;

alter table public.company_time_settings enable row level security;
alter table public.company_holidays enable row level security;
alter table public.job_entry_unlocks enable row level security;
alter table public.meal_claims enable row level security;

drop policy if exists "time settings: authenticated read" on public.company_time_settings;
create policy "time settings: authenticated read" on public.company_time_settings
  for select to authenticated using (true);
drop policy if exists "time settings: manager update" on public.company_time_settings;
create policy "time settings: manager update" on public.company_time_settings
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "holidays: authenticated read" on public.company_holidays;
create policy "holidays: authenticated read" on public.company_holidays
  for select to authenticated using (true);
drop policy if exists "holidays: manager manage" on public.company_holidays;
create policy "holidays: manager manage" on public.company_holidays
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "unlocks: employee read own" on public.job_entry_unlocks;
create policy "unlocks: employee read own" on public.job_entry_unlocks
  for select to authenticated using (user_id = auth.uid() or public.get_my_role() = 'manager');
drop policy if exists "unlocks: manager manage" on public.job_entry_unlocks;
create policy "unlocks: manager manage" on public.job_entry_unlocks
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "meal claims: employee insert" on public.meal_claims;
create policy "meal claims: employee insert" on public.meal_claims
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid())
  );
drop policy if exists "meal claims: employee read own" on public.meal_claims;
create policy "meal claims: employee read own" on public.meal_claims
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "meal claims: manager read" on public.meal_claims;
create policy "meal claims: manager read" on public.meal_claims
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "meal claims: manager update" on public.meal_claims;
create policy "meal claims: manager update" on public.meal_claims
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "parking receipts: employee read own" on public.parking_receipts;
create policy "parking receipts: employee read own" on public.parking_receipts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "parking receipts: manager update" on public.parking_receipts;
create policy "parking receipts: manager update" on public.parking_receipts
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

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

drop trigger if exists parking_receipts_daily_cap on public.parking_receipts;
create trigger parking_receipts_daily_cap
before insert or update of amount, user_id, job_date on public.parking_receipts
for each row execute function public.enforce_daily_parking_cap();

insert into storage.buckets (id, name, public)
values ('meal-receipts', 'meal-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "meal storage: employee upload" on storage.objects;
create policy "meal storage: employee upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal storage: manager read" on storage.objects;
create policy "meal storage: manager read" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-receipts' and public.get_my_role() = 'manager');

create or replace function public.enforce_job_entry_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp;
  deadline time;
  has_unlock boolean;
begin
  if public.get_my_role() = 'manager' then return new; end if;

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

  -- The entire configured minute is permitted. A 23:59 deadline blocks at midnight.
  if local_now >= (new.job_date + deadline + interval '1 minute') then
    raise exception 'The entry deadline for this work date has passed';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_enforce_entry_window on public.jobs;
create trigger jobs_enforce_entry_window
before insert or update on public.jobs
for each row execute function public.enforce_job_entry_window();
