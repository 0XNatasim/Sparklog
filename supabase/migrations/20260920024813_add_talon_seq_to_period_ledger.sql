-- Applied to production as add_talon_seq_to_period_ledger (2026-09-20); recorded here so the
-- migration folder rebuilds the same schema.
alter table public.payroll_period_ledger
  add column if not exists talon_seq integer;

comment on column public.payroll_period_ledger.talon_seq is
  'Cumulative talon reference sequence, assigned once at comptabilisation (rendered as D0034-#### on the pay stub). Global across employees/weeks in comptabilisation order.';
