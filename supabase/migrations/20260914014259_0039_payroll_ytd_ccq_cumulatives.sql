-- 0039: extend payroll_ytd with the full CCQ cumulative (Sommaire) figures.
--
-- The pay stub's "Cumulatif" column carries more than the statutory deductions:
-- CCQ vacation/holiday indemnity (Vacances CCQ), union dues, CCQ benefit lines,
-- safety equipment, KM indemnity, etc. These are RECORD-ONLY opening balances so
-- the app can hold a complete YTD picture per employee; they do not feed the DAS
-- calculation (that still uses rrq/ei/rqap/tax + pensionable/insurable). Dollars.

alter table public.payroll_ytd
  add column if not exists regular_earnings        numeric not null default 0,
  add column if not exists double_time             numeric not null default 0,
  add column if not exists vacation_pay            numeric not null default 0,
  add column if not exists vacances_ccq            numeric not null default 0, -- the 13% indemnity pot
  add column if not exists ccq_levy                numeric not null default 0,
  add column if not exists ccq_benefits_deduction  numeric not null default 0,
  add column if not exists ccq_benefits_advantage  numeric not null default 0,
  add column if not exists ccq_taxable_benefit     numeric not null default 0,
  add column if not exists medic_insurance         numeric not null default 0,
  add column if not exists union_dues              numeric not null default 0,
  add column if not exists union_education_fund     numeric not null default 0,
  add column if not exists insurance_sales_tax     numeric not null default 0,
  add column if not exists safety_equipment        numeric not null default 0,
  add column if not exists km_indemnity            numeric not null default 0,
  add column if not exists other_income            numeric not null default 0,
  add column if not exists hours_ytd               numeric not null default 0;
