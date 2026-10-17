-- 0098: CCQ non-worked days missing from company_holidays (V2.4.149).
--
-- The table was filled in August 2026 without the 2026 holidays already past (Vendredi saint,
-- lundi de Pâques, Patriotes, Fête nationale, Fête du Canada) nor the end of the 2025-2026 winter
-- shutdown. Sources: convention collective ICI 2025-2029, art. 19.04 1) a)-b) and 3) (fixed dates
-- for the life of the agreement), and the CCQ 2026 calendar (winter shutdown 21 December 2025 →
-- 3 January 2026). The full list of the agreement's holidays for 2026-2028 is written here so the
-- migrations folder rebuilds the calendar on its own; rows already present are left untouched.
-- The newly added 2026 weeks were paid by Dynacom before Sparklog took over payroll (week 43):
-- no posted pay changes, only the history and the weekly views.
insert into public.company_holidays (holiday_date, label) values
  ('2026-01-01', 'Jour de l''An'),
  ('2026-01-02', 'Vacances de la construction — hiver'),
  ('2026-01-03', 'Vacances de la construction — hiver'),
  ('2026-04-03', 'Vendredi saint'),
  ('2026-04-06', 'Lundi de Pâques'),
  ('2026-05-18', 'Journée nationale des patriotes'),
  ('2026-06-24', 'Fête nationale du Québec'),
  ('2026-07-03', 'Fête du Canada'),
  ('2026-09-07', 'Fête du Travail'),
  ('2026-10-12', 'Action de grâces'),
  ('2026-11-13', 'Jour du Souvenir'),
  ('2026-12-25', 'Noël'),
  ('2027-01-01', 'Jour de l''An'),
  ('2027-03-26', 'Vendredi saint'),
  ('2027-03-29', 'Lundi de Pâques'),
  ('2027-05-24', 'Journée nationale des patriotes'),
  ('2027-06-24', 'Fête nationale du Québec'),
  ('2027-07-02', 'Fête du Canada'),
  ('2027-09-06', 'Fête du Travail'),
  ('2027-10-11', 'Action de grâces'),
  ('2027-11-12', 'Jour du Souvenir'),
  ('2027-12-25', 'Noël'),
  ('2028-01-01', 'Jour de l''An'),
  ('2028-04-14', 'Vendredi saint'),
  ('2028-04-17', 'Lundi de Pâques'),
  ('2028-05-22', 'Journée nationale des patriotes'),
  ('2028-06-23', 'Fête nationale du Québec'),
  ('2028-06-30', 'Fête du Canada'),
  ('2028-09-04', 'Fête du Travail'),
  ('2028-10-09', 'Action de grâces'),
  ('2028-11-10', 'Jour du Souvenir'),
  ('2028-12-25', 'Noël')
on conflict (holiday_date) do nothing;
