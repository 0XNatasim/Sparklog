-- 0048: per-employee policy — return-to-warehouse time paid without social benefits
-- once the day exceeds 8h.
--
-- Return time is logged inside the job's Départ→Fin span. Default behaviour: it is paid
-- like any other worked time (with CCQ social benefits). When this flag is on and the
-- day's total (return included) exceeds 8h, the return portion is carved out and paid at
-- the base rate with NO social benefits; the 8h/overtime split applies to the rest.
--
-- Pay parameter (no NAS/SIN) — the existing manager profile-write policy covers it.
alter table public.profiles
  add column if not exists return_overtime_no_benefits boolean not null default false;
