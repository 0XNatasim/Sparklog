-- 0100: DAY_ROUNDING starts on CCQ week 43 — Sunday 2026-10-11 (owner decision 2026-10-17, V2.4.153).
-- Record-only: the rule is computed by the payroll engine (supabase/functions/_shared/payroll_engine.js
-- 2.6.1, DAY_ROUNDING.startDate); no job or ledger row changes.
--
-- Week 42 (2026-10-04 → 10-10) was paid by Dynacom; its cumulative is the starting point of Sparklog
-- (DYNACOM_CUMULATIVE_END, 0099). Every employee's 15-minute rounding counter now starts at 0 on the
-- first week Sparklog pays, so an error in a week-42 timesheet can no longer carry minutes into week 43.
-- Days before 2026-10-11 are paid to the minute (they are not paid by Sparklog anyway).

update public.payroll_rules
   set effective_from = date '2026-10-11',
       source_document = 'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-17 (start moved from CCQ week 42, 2026-10-04, to week 43, 2026-10-11: first week paid by Sparklog, counter at 0). Messier practice: days rounded to 15 minutes on the pay stub.'
 where rule_code = 'DAY_ROUNDING' and version = 1;
