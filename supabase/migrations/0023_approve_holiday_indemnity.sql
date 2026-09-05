-- Approve the holiday/vacation indemnity with the value supplied by the interim
-- authority (simon1984bjeux@gmail.com) 2026-09-05, cited to the CCQ chèque-vacances
-- page: 13% of weekly wages earned = 6% annual vacation + 5.5% paid statutory holidays
-- + 1.5% sick leave. Same rate for all levels; dollars differ because wages differ.
-- Forward-only update of the draft seeded in 0022. Idempotent.
update public.payroll_rules
   set status = 'approved',
       approved_by = 'simon1984bjeux@gmail.com (interim authority)',
       approved_at = coalesce(approved_at, now()),
       title = 'Indemnité de congés — vacation + statutory holiday + sick (13% of weekly wages)',
       parameters = '{"total_rate":0.13,"components":{"annual_vacation":0.06,"statutory_holidays":0.055,"sick_leave":0.015},"base":"gross salary earned during the week of work (includes overtime premium dollars), per worker","rate_uniform_across_levels":true,"dollars_differ_by_level_because_wages_differ":true,"remittance":"employer remits monthly to CCQ; CCQ pays workers twice a year (end of June and end of November)","testing_jsx_values_are":"13% expressed as $/h per level (6,60/3,30/3,96/4,62/5,61)"}'::jsonb,
       examples = '[{"input":"weekly gross wages = $1000","expected":"indemnity = $130 (60 vacation + 55 holidays + 15 sick)"}]'::jsonb,
       exceptions = '[{"assumption_to_confirm":"base = all wages earned in the week INCLUDING overtime premium dollars, per the CCQ wording ''salary earned during each week of work''"}]'::jsonb,
       source_document = 'CCQ — Chèque de vacances / indemnité de congés annuels et jours fériés: https://www.ccq.org/en/avantages-sociaux/salaire-taux/cheque-vacances ; collective agreements: https://www.ccq.org/fr-CA/loi-r20/conventions-collectives ; values confirmed by interim authority (simon1984bjeux@gmail.com) 2026-09-05: 13% of weekly salary = 6% vacation + 5.5% statutory holidays + 1.5% sick leave'
 where rule_code = 'HOLIDAY_INDEMNITY' and version = 1;
