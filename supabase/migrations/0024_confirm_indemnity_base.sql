-- Confirm the holiday-indemnity base and nature (interim authority 2026-09-05).
-- Per the CCQ (via construmd.com "Paie CCQ", 2026-06-30 and mobilepunch.com "How to
-- calculate CCQ vacation pay in 2026"): the 13% is calculated on gross wages earned,
-- and gross wages INCLUDE overtime; the amount is paid by the EMPLOYER on top of wages
-- and is NOT deducted from the worker. Clears the earlier assumption flag. Idempotent.
update public.payroll_rules
   set parameters = parameters
        || '{"base_includes_overtime":true,"employer_paid_on_top":true,"not_a_worker_deduction":true}'::jsonb,
       exceptions = '[]'::jsonb,
       source_document = source_document
        || ' | Base confirmed to include overtime (salaire brut incl. temps supplémentaire) and to be employer-paid on top of wages (not deducted): CCQ via construmd.com "Paie CCQ" (2026-06-30) and mobilepunch.com "How to calculate CCQ vacation pay in 2026"; confirmed by interim authority 2026-09-05.'
 where rule_code = 'HOLIDAY_INDEMNITY' and version = 1
     and not (parameters ? 'base_includes_overtime');
