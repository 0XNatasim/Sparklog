-- 0093: per-employee RRQ (QPP) exemption (Paramètres › Paie), the twin of ei_exempt (0091).
--
-- Some employees no longer contribute to the RRQ — e.g. a worker aged 65 to 69 who receives the RRQ
-- retirement pension and filed the stop-contributing choice. The Dynacom payroll withholds no RRQ for
-- them (cumulative of the year: 0 $ contribution, 0 $ pensionable earnings). Without this flag Sparklog
-- would start withholding RRQ at its first week. Set by a manager from the payroll records, never
-- inferred; no RRQ, employee or employer.

alter table public.employee_tax_profiles
  add column if not exists rrq_exempt boolean not null default false;

comment on column public.employee_tax_profiles.rrq_exempt is
  'Not contributing to the RRQ (QPP), e.g. 65-69 receiving the retirement pension with the stop-contributing choice: no RRQ contribution, employee or employer.';
