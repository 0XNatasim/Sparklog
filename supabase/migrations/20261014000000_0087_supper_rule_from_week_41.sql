-- 0087: the supper rule of 0086 (2 h 15 of overtime = 10 h 15 of paid work, return never
-- counted) applies from CCQ week 41 — Sunday 2026-09-27 — instead of 2026-10-13
-- (owner decision 2026-10-13).
--
-- 1. payroll_rules: SUPPER v1 ends before 2026-09-27, v3 starts that day. v2 keeps an empty
--    range for the record (ranges are half-open; payroll_rules_no_overlap). Order matters: v1
--    is shortened before v3 is extended so the exclusion constraint never sees an overlap.
-- 2. Every employee-day with a job since 2026-09-27 goes through reconcile_overtime_meal (the
--    function the job triggers run): a supper claim still pending on a day below 615 minutes of
--    work without return is withdrawn, with its manager notification and the job's flag. Claims
--    a manager already reviewed are kept, as in 0086. The new rule is stricter than v1 (615 paid
--    minutes, return included), so no day gains a supper.

update public.payroll_rules
   set effective_to = date '2026-09-27'
 where rule_code = 'SUPPER' and version = 1;

update public.payroll_rules
   set effective_from = date '2026-09-27', effective_to = date '2026-09-27'
 where rule_code = 'SUPPER' and version = 2;

update public.payroll_rules
   set effective_from = date '2026-09-27',
       source_document = 'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-13 (revised; applies from CCQ week 41, 2026-09-27); convention collective ICI 2025-2029, art. 20.07 3) c) i.'
 where rule_code = 'SUPPER' and version = 3;

select public.reconcile_overtime_meal(d.user_id, d.job_date)
  from (
    select distinct j.user_id, j.job_date
      from public.jobs j
     where j.job_date >= date '2026-09-27'
  ) d;
