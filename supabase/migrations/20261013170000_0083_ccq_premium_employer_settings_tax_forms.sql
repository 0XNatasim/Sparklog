-- 0083: owner decisions of 2026-10-13 (interim payroll authority).
--
-- 1. Two team-leader premiums per employee:
--    - profiles.team_leader_premium (existing): now the « prime hors CCQ ». Paid as
--      before; outside the CCQ prélèvement and the 13 % indemnity, as Messier's stubs
--      print it (D0033-0007: 4,06 $/h, prélèvement on the wage only).
--    - profiles.team_leader_premium_ccq (new, $/h): the « prime de chef d'équipe CCQ »
--      (convention ICI 22.03). Included in the 13 % indemnity base AND the 0,75 %
--      prélèvement base.
--    team_leader_premium_overtime (0082) majore both premiums on overtime hours.
--
-- 2. payroll_employer_settings (one row): annual payroll estimate (FSS rate, FDRCMO
--    threshold), FSS category, and the CNESST rate from Messier's notice of assessment
--    (in $ per 100 $ of insurable payroll, as printed on the notice). Without a CNESST
--    rate the calculation stays requires_review — no default is guessed.
--
-- 3. employee_tax_profiles: per-employee amounts from the TD1 (federal) and
--    TP-1015.3 (Québec) forms. Empty = the basic personal amount (engine default).
--    Only the amounts are stored, never the form or the SIN.
--
-- Access: manager tier (get_my_role() collapses admin/owner to manager), like the pay
-- ledger. Employees cannot read or write any of it.

alter table public.profiles
  add column if not exists team_leader_premium_ccq numeric(10,2) not null default 0
    check (team_leader_premium_ccq >= 0);

comment on column public.profiles.team_leader_premium_ccq is
  'Team-leader premium declared to the CCQ ($/h, convention 22.03): in the 13% indemnity and the CCQ prélèvement base. team_leader_premium is the non-CCQ premium.';
comment on column public.profiles.team_leader_premium is
  'Non-CCQ premium ($/h): paid on regular hours (and overtime with team_leader_premium_overtime); outside the 13% indemnity and the CCQ prélèvement.';

create table if not exists public.payroll_employer_settings (
  id                       boolean primary key default true check (id = true),
  annual_payroll_estimate  numeric(14,2) check (annual_payroll_estimate is null or annual_payroll_estimate >= 0),
  fss_category             text not null default 'general'
                             check (fss_category in ('general', 'primary_manufacturing', 'public')),
  cnesst_rate_per_100      numeric(8,4) check (cnesst_rate_per_100 is null or (cnesst_rate_per_100 >= 0 and cnesst_rate_per_100 < 100)),
  cnesst_year              integer check (cnesst_year is null or cnesst_year between 2020 and 2100),
  updated_at               timestamptz not null default now(),
  updated_by               uuid references public.profiles(id) on delete set null
);

comment on table public.payroll_employer_settings is
  'Employer payroll parameters (single row): annual payroll estimate, FSS category, CNESST rate per 100 $ from the notice of assessment.';

insert into public.payroll_employer_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.employee_tax_profiles (
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  td1_claim_amount        numeric(12,2) check (td1_claim_amount is null or td1_claim_amount >= 0),
  federal_additional_tax  numeric(10,2) not null default 0 check (federal_additional_tax >= 0),
  tp1015_3_credits        numeric(12,2) check (tp1015_3_credits is null or tp1015_3_credits >= 0),
  quebec_additional_tax   numeric(10,2) not null default 0 check (quebec_additional_tax >= 0),
  forms_received_on       date,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles(id) on delete set null
);

comment on table public.employee_tax_profiles is
  'Per-employee TD1 / TP-1015.3 amounts (no SIN, no form image). Null claim = basic personal amount.';

alter table public.payroll_employer_settings enable row level security;
alter table public.employee_tax_profiles enable row level security;

drop policy if exists "payroll_employer_settings: manager read" on public.payroll_employer_settings;
create policy "payroll_employer_settings: manager read" on public.payroll_employer_settings
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "payroll_employer_settings: manager write" on public.payroll_employer_settings;
create policy "payroll_employer_settings: manager write" on public.payroll_employer_settings
  for update to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop policy if exists "employee_tax_profiles: manager read" on public.employee_tax_profiles;
create policy "employee_tax_profiles: manager read" on public.employee_tax_profiles
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "employee_tax_profiles: manager write" on public.employee_tax_profiles;
create policy "employee_tax_profiles: manager write" on public.employee_tax_profiles
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');
