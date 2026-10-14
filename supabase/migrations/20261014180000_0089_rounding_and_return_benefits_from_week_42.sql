-- 0089: DAY_ROUNDING and "return with benefits up to 8 h" both start on CCQ week 42 — Sunday
-- 2026-10-04 (owner decision 2026-10-14, interim payroll authority). Record-only: both rules are
-- computed by the payroll engine (supabase/functions/_shared/payroll_engine.js 2.5.0,
-- DAY_ROUNDING.startDate / RETURN_WITH_BENEFITS.startDate); no job or ledger row changes.
--
-- 1. DAY_ROUNDING v1 (0088) moves from 2026-09-27 to 2026-10-04: days before are paid to the minute
--    and every employee's counter starts at 0 on 2026-10-04.
-- 2. RETURN_WITH_BENEFITS_TO_8H v1: the per-employee option return_with_benefits_to_8h (0081, now
--    checked for every employee) only applies to days from 2026-10-04; earlier days keep the default
--    (return time at the base rate without benefits).

update public.payroll_rules
   set effective_from = date '2026-10-04',
       source_document = 'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-14 (start moved from CCQ week 41 to week 42, 2026-10-04). Messier practice: days rounded to 15 minutes on the pay stub.'
 where rule_code = 'DAY_ROUNDING' and version = 1;

insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, parameters, examples, exceptions, version, status, approved_by, approved_at)
select
  'RETURN_WITH_BENEFITS_TO_8H', 'Return-to-warehouse time with benefits up to 8 h (Messier bonus option)', 'C', '220', 'standard_8h',
  date '2026-10-04', null,
  'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-14: option checked for every employee, effective CCQ week 42. Default rule: convention collective ICI 2025-2029, art. 23.04 2) a), 23.15.',
  '{"option":"profiles.return_with_benefits_to_8h","effect":"return time paid as regular time with benefits while the day''s work + return stays within 8 h; the rest without benefits","before_start":"return time at the base rate without benefits"}'::jsonb,
  '[{"input":"6h30 work + 1h return on 2026-10-05, option checked","expected":"7h30 regular with benefits"},{"input":"same day on 2026-10-02 (week 41)","expected":"6h30 regular + 1h return without benefits"}]'::jsonb,
  '[{"case":"Saturday, Sunday, holiday, subcontractor","treatment":"return without benefits"}]'::jsonb,
  1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
where not exists (select 1 from public.payroll_rules where rule_code = 'RETURN_WITH_BENEFITS_TO_8H' and version = 1);
