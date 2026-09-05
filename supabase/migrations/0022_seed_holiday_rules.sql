-- Holiday rules. Employees never work statutory holidays or the construction vacation
-- weeks (confirmed by interim authority 2026-09-04); the app already blocks entry on
-- company_holidays dates. The holiday/vacation INDEMNITY is left as a draft
-- (requires_review) until the CCQ percentage/base is supplied — ccq.org is blocked by
-- the sandbox network policy, so the value could not be fetched automatically.
-- Idempotent: safe to re-run.
insert into public.payroll_rules
  (rule_code, title, sector, trade, schedule_type, effective_from, effective_to,
   source_document, source_section, parameters, examples, exceptions, version, status, approved_by, approved_at)
values
(
  'HOLIDAY', 'Statutory holidays and construction vacation — non-working', 'C', '220', null,
  date '2020-01-01', null,
  'CCQ calendar — https://www.ccq.org/en/avantages-sociaux/dates-conges-vacances and FAQ jours fériés https://www.ccq.org/en/avantages-sociaux/dates-conges-vacances/faq-feries ; confirmed non-working by interim authority 2026-09-04',
  'Dates congés / vacances; FAQ fériés',
  '{"working":false,"entry_blocked":true,"treated_like":"weekend","calendar_source":"company_holidays (CCQ calendar, populated through 2029)"}'::jsonb,
  '[{"input":"job_date is in company_holidays","expected":"no work entered (blocked); 0 regular, 0 overtime"}]'::jsonb,
  '[]'::jsonb, 1, 'approved', 'simon1984bjeux@gmail.com (interim authority)', now()
),
(
  'HOLIDAY_INDEMNITY', 'Holiday + vacation indemnity (SparkLog to compute)', 'C', '220', null,
  date '2020-01-01', null,
  'CCQ — Chèque de vacances / indemnité de congés annuels et jours fériés: https://www.ccq.org/en/avantages-sociaux/salaire-taux/cheque-vacances ; collective agreements: https://www.ccq.org/fr-CA/loi-r20/conventions-collectives',
  'Indemnité de congés annuels obligatoires et jours fériés chômés',
  '{}'::jsonb,
  '[]'::jsonb,
  '[{"requires_review":"Fetch of ccq.org blocked by sandbox network policy on 2026-09-04. Need the indemnity percentage(s) and the base wages it applies to, from the CCQ cheque-vacances page, before this rule can be approved and computed."}]'::jsonb,
  1, 'draft', null, null
)
on conflict (rule_code, version) do nothing;
