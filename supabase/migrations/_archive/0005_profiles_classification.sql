-- Per-employee payroll classification used by the manager/Testing Employees tab.
--   apprentice_level: 'compagnon' | 'apprenti_4' | 'apprenti_3' | 'apprenti_2' | 'apprenti_1'
--   sector:           'C' (commercial / ICI) | 'R' (residentiel)
--   km_rate:          mileage reimbursement $/km (typically 0.49–0.99)

alter table public.profiles
  add column if not exists apprentice_level text,
  add column if not exists sector          text,
  add column if not exists km_rate          numeric(4,2);

-- Managers can already update any profile (see 0002_profiles_ccq_number.sql),
-- so no extra RLS is required for these columns.
