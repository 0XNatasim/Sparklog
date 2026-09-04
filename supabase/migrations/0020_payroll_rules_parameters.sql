-- Structured numeric parameters for a rule, so the engine consumes rule values as
-- DATA (not code). Kept separate from `examples` (worked cases) and `exceptions`.
alter table public.payroll_rules
  add column if not exists parameters jsonb not null default '{}'::jsonb;
