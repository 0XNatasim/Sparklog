-- Full imported (legacy) talon kept verbatim so a past pay stub can be re-rendered exactly
-- as it was, with every line (Transactions + Sommaire Période/Cumulatif + header). The row's
-- cumulative columns still hold the Cumulatif figures (for the chain / ROE); this JSON is only
-- for faithful reproduction of the original stub.
alter table public.payroll_period_ledger
  add column if not exists imported_talon jsonb;
