-- 0041: per-week payroll ledger (snapshots) for the Payroll test bench.
--
-- payroll_ytd (0036/0039) holds ONE opening seed per employee — the balances from
-- BEFORE SparkLog started tracking. It has no history, so posting a week overwrote
-- the single row and "going back to a date" could not restore prior balances.
--
-- This ledger stores one row per (employee, pay-period end) with the CLOSING
-- cumulatives after that week — a snapshot. The opening balance for a week is the
-- latest ledger snapshot ending before it, or the payroll_ytd seed if none. Posting a
-- week upserts its snapshot (idempotent by period_end: re-posting the same week
-- replaces its row from the same opening, never compounding).
--
-- Still the Testing → Payroll bench: "Not finalized payroll · Requires payroll
-- review" (ADR 0001). Nothing here is finalized pay. Columns mirror payroll_ytd.

create table if not exists public.payroll_period_ledger (
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  tax_year                int  not null,
  period_end              date not null,               -- the Saturday that ends the CCQ pay week
  period_start            date,                         -- the Sunday that starts it
  -- Statutory closing cumulatives (feed the next period's caps/tax).
  gross_income            numeric not null default 0,
  rrq_employee            numeric not null default 0,
  rrq2_employee           numeric not null default 0,
  ei_employee             numeric not null default 0,
  rqap_employee           numeric not null default 0,
  federal_tax             numeric not null default 0,
  quebec_tax              numeric not null default 0,
  pensionable_income_rrq  numeric not null default 0,
  insurable_income_ei     numeric not null default 0,
  insurable_income_rqap   numeric not null default 0,
  labour_standards_income numeric not null default 0,
  -- CCQ record-only closing cumulatives (Sommaire "Cumulatif" column).
  regular_earnings        numeric not null default 0,
  double_time             numeric not null default 0,
  vacation_pay            numeric not null default 0,
  vacances_ccq            numeric not null default 0,
  ccq_levy                numeric not null default 0,
  ccq_benefits_deduction  numeric not null default 0,
  ccq_benefits_advantage  numeric not null default 0,
  ccq_taxable_benefit     numeric not null default 0,
  medic_insurance         numeric not null default 0,
  union_dues              numeric not null default 0,
  union_education_fund    numeric not null default 0,
  insurance_sales_tax     numeric not null default 0,
  safety_equipment        numeric not null default 0,
  km_indemnity            numeric not null default 0,
  other_income            numeric not null default 0,
  hours_ytd               numeric not null default 0,
  updated_at              timestamptz not null default now(),
  primary key (user_id, period_end)
);

create index if not exists payroll_period_ledger_user_year_idx
  on public.payroll_period_ledger (user_id, tax_year, period_end);

alter table public.payroll_period_ledger enable row level security;

-- Manager-tier only (get_my_role collapses admin/owner to manager). No NAS/SIN here.
drop policy if exists "payroll_period_ledger: manager read" on public.payroll_period_ledger;
create policy "payroll_period_ledger: manager read" on public.payroll_period_ledger
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "payroll_period_ledger: manager write" on public.payroll_period_ledger;
create policy "payroll_period_ledger: manager write" on public.payroll_period_ledger
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop trigger if exists payroll_period_ledger_set_updated_at on public.payroll_period_ledger;
create trigger payroll_period_ledger_set_updated_at
  before update on public.payroll_period_ledger
  for each row execute function public.set_updated_at();
