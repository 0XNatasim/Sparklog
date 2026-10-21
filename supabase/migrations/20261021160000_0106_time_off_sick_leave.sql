-- 0106: « Maladie » (sick leave) time-off category (V2.4.163).
--
-- Gestion › Employés › Absences gets a « Maladie » choice and a sick-leave register (days per
-- employee and per year). Informational like the other categories: no pay effect (the CCQ 13 %
-- indemnity already includes the 1.5 % sick-leave share, convention 19.04-19.05).
alter table public.employee_time_off drop constraint if exists employee_time_off_category_chk;
alter table public.employee_time_off add constraint employee_time_off_category_chk
  check (category in ('conge', 'vacances', 'absence', 'maladie', 'temps_partiel'));
