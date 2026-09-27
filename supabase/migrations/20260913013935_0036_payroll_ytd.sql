-- 0036: per-employee year-to-date opening balances for the Payroll test bench.
--
-- SparkLog is being adopted mid-year, so employees have already been paid for
-- weeks elsewhere. The payroll (DAS) engine caps each deduction at its annual
-- maximum using what the employee has already paid this year, so it needs an
-- opening YTD per person. This table stores that opening snapshot (in dollars),
-- entered once by a manager/owner and reloaded on each calculation.
--
-- These feed the Testing → Payroll bench, which is labeled "Not finalized
-- payroll · Requires payroll review" (ADR 0001). Nothing here is finalized pay.

create table if not exists public.payroll_ytd (
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  tax_year                int  not null,
  as_of_date              date,                       -- last pay date included in these balances
  gross_income            numeric not null default 0,
  rrq_employee            numeric not null default 0, -- base + 1st additional paid YTD
  rrq2_employee           numeric not null default 0, -- 2nd additional paid YTD
  ei_employee             numeric not null default 0,
  rqap_employee           numeric not null default 0,
  federal_tax             numeric not null default 0,
  quebec_tax              numeric not null default 0,
  pensionable_income_rrq  numeric not null default 0, -- pensionable earnings YTD (for tier-2 band)
  insurable_income_ei     numeric not null default 0,
  insurable_income_rqap   numeric not null default 0,
  labour_standards_income numeric not null default 0,
  updated_at              timestamptz not null default now(),
  primary key (user_id, tax_year)
);

alter table public.payroll_ytd enable row level security;

-- Payroll opening balances are manager-tier only (get_my_role collapses admin/owner
-- to manager). They contain no NAS/SIN, so no owner-only gating is required.
drop policy if exists "payroll_ytd: manager read" on public.payroll_ytd;
create policy "payroll_ytd: manager read" on public.payroll_ytd
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "payroll_ytd: manager write" on public.payroll_ytd;
create policy "payroll_ytd: manager write" on public.payroll_ytd
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop trigger if exists payroll_ytd_set_updated_at on public.payroll_ytd;
create trigger payroll_ytd_set_updated_at
  before update on public.payroll_ytd
  for each row execute function public.set_updated_at();
