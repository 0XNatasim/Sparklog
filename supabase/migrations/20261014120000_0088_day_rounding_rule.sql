-- 0088: DAY_ROUNDING — each day paid to the nearest 15 minutes with a running counter per
-- employee (owner decision 2026-10-14, interim payroll authority). Record-only: the rule is
-- computed by the payroll engine (supabase/functions/_shared/payroll_engine.js 2.4.0,
-- DAY_ROUNDING / buildDayRounding); no table or job row changes.
--
--   paid = round15(worked − counter) ; counter += paid − worked (never reset)
--   Mon 8h07 → 8h00 (counter −7) · Tue 7h53 → 8h00 (counter 0) · 8h08 → 8h15 (counter +7)
-- Worked = the day's paid spans, return included, unpaid first trip removed. The minutes added
-- or removed are the end of the day's work (overtime past 8 h). From CCQ week 41.

insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, parameters, examples, exceptions, version, status, approved_by, approved_at)
select
  'DAY_ROUNDING', 'Day rounding to 15 minutes with a carried counter', 'C', '220', 'standard_8h',
  date '2026-09-27', null,
  'Interim authority decision (simon1984bjeux@gmail.com), 2026-10-14. Messier practice: days rounded to 15 minutes on the pay stub.',
  '{"step_minutes":15,"round":"nearest (7 down, 8 up)","counter":"per employee, carried day to day, never reset","worked":"Depart-Fin spans, return included, unpaid first trip removed","adjusted_minutes":"end of the day''s work (overtime past 8 h)"}'::jsonb,
  '[{"input":"Monday 8h07, counter 0","expected":"paid 8h00, counter -7"},{"input":"Tuesday 7h53, counter -7","expected":"paid 8h00, counter 0"},{"input":"8h08, counter 0","expected":"paid 8h15, counter +7"}]'::jsonb,
  '[{"case":"overtime-proof and supper thresholds, anomalies","treatment":"real minutes, not rounded"}]'::jsonb,
  1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
where not exists (select 1 from public.payroll_rules where rule_code = 'DAY_ROUNDING' and version = 1);
