-- CCQ construction vacations and statutory holidays published for 2026-2029.
-- These rows make the calendar automatic for employees; managers do not have
-- to enter holidays by hand. Add a new dated migration when the CCQ publishes
-- later years.

insert into public.company_holidays (holiday_date, label)
select day::date, label
from (
  values
    ('2026-07-19'::date, '2026-08-01'::date, 'Vacances de la construction — été'),
    ('2026-12-20'::date, '2027-01-02'::date, 'Vacances de la construction — hiver'),
    ('2027-07-25'::date, '2027-08-07'::date, 'Vacances de la construction — été'),
    ('2027-12-19'::date, '2028-01-01'::date, 'Vacances de la construction — hiver'),
    ('2028-07-23'::date, '2028-08-05'::date, 'Vacances de la construction — été'),
    ('2028-12-24'::date, '2029-01-06'::date, 'Vacances de la construction — hiver')
) as vacation(start_date, end_date, label)
cross join lateral generate_series(vacation.start_date, vacation.end_date, interval '1 day') as dates(day)
on conflict (holiday_date) do update set label = excluded.label;

insert into public.company_holidays (holiday_date, label) values
  ('2026-01-01', 'Jour de l''An'),
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
  ('2028-12-25', 'Noël'),
  ('2029-01-01', 'Jour de l''An'),
  ('2029-03-30', 'Vendredi saint'),
  ('2029-04-02', 'Lundi de Pâques'),
  ('2029-12-25', 'Noël')
on conflict (holiday_date) do update set label = excluded.label;

-- The application calendar is read-only. Future CCQ calendars are deployed as
-- versioned migrations so every environment uses the same official dates.
drop policy if exists "holidays: manager manage" on public.company_holidays;
