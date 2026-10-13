-- 0081: per-employee policy — return-to-warehouse time WITH social benefits up to 8h.
--
-- Messier rule (owner decision 2026-10-13; convention ICI 2025-2029, art. 23.04 2) a) and
-- 23.15 treat travel requested after the normal day as « temps de transport »):
--   - Return time (jobs.return_time_minutes, logged inside Départ→Fin) is never overtime
--     and never counts toward the 8h/overtime split, which uses the work only.
--   - Default (false): all return time is paid at the base rate without social benefits.
--   - true: return time keeps its social benefits while the day (work + return) stays
--     within 8h; only the part beyond 8h is paid without benefits.
-- Subcontractors are always treated as false by the payroll engine.
--
-- Everyone starts unchecked; managers check employees in Règles de temps. Pay is computed
-- from jobs on demand, so every week not yet closed recalculates with this rule.
--
-- Replaces return_overtime_no_benefits (0048/0049), which the app no longer reads. That
-- column is kept for now so a client still running the previous build does not fail on
-- its select; drop it in a later migration.
--
-- Pay parameter (no NAS/SIN): the manager profile-write policy covers it, and the employee
-- whitelist trigger (0018) keeps employees from changing it.
alter table public.profiles
  add column if not exists return_with_benefits_to_8h boolean not null default false;

comment on column public.profiles.return_with_benefits_to_8h is
  'Return-to-warehouse time keeps social benefits while work + return stays within 8h/day (otherwise base rate, no benefits). Never overtime.';
comment on column public.profiles.return_overtime_no_benefits is
  'DEPRECATED (0081): replaced by return_with_benefits_to_8h; no longer read by the app.';
