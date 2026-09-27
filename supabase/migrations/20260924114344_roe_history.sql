-- Historical per-week insurable earnings/hours for weeks that predate SparkLog payroll
-- (imported from previous pay stubs). Kept in its OWN table so it never touches the locked
-- opening balance or the comptabiliser chain — the Record of Employment reads it in addition
-- to payroll_period_ledger to fill the pre-SparkLog weeks of the 53-week window.
create table if not exists public.roe_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tax_year integer not null,
  period_start date not null,
  period_end date not null,
  insurable_earnings numeric not null default 0,
  insurable_hours numeric not null default 0,
  source_file text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, period_end)
);

alter table public.roe_history enable row level security;

drop policy if exists "roe_history: manager read" on public.roe_history;
create policy "roe_history: manager read" on public.roe_history
  for select to authenticated using (public.get_my_role() = 'manager');

drop policy if exists "roe_history: manager write" on public.roe_history;
create policy "roe_history: manager write" on public.roe_history
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');
