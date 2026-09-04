-- Seed the compensation rules confirmed by the interim CCQ/payroll authority
-- (simon1984bjeux@gmail.com) on 2026-09-04. Values are provided from operational
-- knowledge; a CCQ primary-source citation is still pending, after which these should
-- be reviewed by a qualified specialist. Idempotent: safe to re-run.
insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, parameters, examples, exceptions, version, status, approved_by, approved_at)
values
(
  'OVERTIME', 'Overtime thresholds and rates', 'C', '220', 'standard_8h',
  date '2020-01-01', null,
  'Interim authority confirmation (simon1984bjeux@gmail.com), 2026-09-04; CCQ primary-source citation pending',
  '{"regular_daily_minutes":480,"overtime_trigger":"daily_over_8h","rate_split_basis":"weekly","weekly_first_ot_minutes_at_1_5x":60,"rate_1":1.5,"rate_1_scope":"first 60 min of the week''s overtime","rate_2":2.0,"rate_2_scope":"all weekly overtime beyond the first 60 min","weekly_regular_hours":40,"weekend_worked":false}'::jsonb,
  '[{"input":"9h each day Mon-Fri (45h week)","expected":"40h regular, 1h @1.5x, 4h @2x"},{"input":"12h Mon then 24h Tue-Fri (36h week)","expected":"Mon 8 reg + 4 OT; weekly OT 4h -> first 60min @1.5x, remaining 3h @2x"}]'::jsonb,
  '[]'::jsonb, 1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
),
(
  'SUPPER', 'Supper / meal eligibility', 'C', '220', 'standard_8h',
  date '2020-01-01', null,
  'Interim authority confirmation (simon1984bjeux@gmail.com), 2026-09-04; CCQ primary-source citation pending',
  '{"min_daily_worked_minutes":615,"weekdays_only":true,"weekend_worked":false}'::jsonb,
  '[{"input":"weekday, 615+ worked minutes","expected":"supper eligible"},{"input":"weekend","expected":"not applicable - no weekend work"}]'::jsonb,
  '[]'::jsonb, 1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
),
(
  'TRADE_SECTOR', 'Default trade and sector', 'C', '220', null,
  date '2020-01-01', null,
  'Interim authority confirmation (simon1984bjeux@gmail.com), 2026-09-04; CCQ primary-source citation pending',
  '{"trade_code":"220","sector":"C","applies_to":"all employees for now"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
),
(
  'TEAM_LEADER_PREMIUM', 'Team-leader premium application', 'C', '220', null,
  date '2020-01-01', null,
  'Interim authority confirmation (simon1984bjeux@gmail.com), 2026-09-04; CCQ primary-source citation pending',
  '{"applies_to":"all_hours","amount_source":"per-employee team_leader_premium ($/h added to base hourly rate)"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
)
on conflict (rule_code, version) do nothing;
