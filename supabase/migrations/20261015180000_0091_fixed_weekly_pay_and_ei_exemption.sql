-- 0091: fixed weekly pay and EI exemption, per employee (Paramètres › Paie).
--
-- The owner (Karine Messier, Présidente) is paid the same pay every week without entering jobs:
-- « Régulier à taux horaire 40,00 × 51,0000 = 2 040,00 $ » (stub D0038-0002, week of 2026-10-04 →
-- 2026-10-10). Until now Sparklog only paid hours from approved jobs, so her pay was missing from
-- Talons, DAS, Calcul, Paie de la semaine and the costs.
--
-- employee_tax_profiles (manager tier only, migration 0083) gains:
--   fixed_weekly_hours  hours paid every CCQ week at profiles.hourly_rate, whatever the jobs
--                       (null = paid from approved jobs, as before). Fixed pay has no CCQ
--                       benefits, levies or 13 % indemnity.
--   fixed_pay_start     first day of the first week paid this way; earlier weeks were paid
--                       outside Sparklog (their totals are in the payroll_ytd opening).
--   ei_exempt           not insurable for EI (Employment Insurance Act s. 5(2)(b): a person who
--                       controls more than 40 % of the corporation's voting shares). No EI
--                       premium, employee or employer — D0038-0002 withholds none. Set by a
--                       manager, never inferred.

alter table public.employee_tax_profiles
  add column if not exists fixed_weekly_hours numeric(5,2)
    check (fixed_weekly_hours is null or (fixed_weekly_hours > 0 and fixed_weekly_hours <= 80)),
  add column if not exists fixed_pay_start date,
  add column if not exists ei_exempt boolean not null default false;

alter table public.employee_tax_profiles
  drop constraint if exists employee_tax_profiles_fixed_pay_start_required;
alter table public.employee_tax_profiles
  add constraint employee_tax_profiles_fixed_pay_start_required
    check (fixed_weekly_hours is null or fixed_pay_start is not null);

comment on column public.employee_tax_profiles.fixed_weekly_hours is
  'Fixed pay: hours paid every CCQ week at profiles.hourly_rate from fixed_pay_start, whatever the jobs. No CCQ benefits. Null = paid from approved jobs.';
comment on column public.employee_tax_profiles.fixed_pay_start is
  'First day of the first week paid at fixed_weekly_hours. Required with fixed_weekly_hours.';
comment on column public.employee_tax_profiles.ei_exempt is
  'Not insurable for EI (EI Act 5(2)(b), > 40 % of the voting shares): no EI premium, employee or employer.';
