-- Time off (congés): add partial-day hours and weekly recurrence.
--
-- Existing model was a full-day date range (start_date..end_date). We add:
--   - kind: 'range' (a dated congé, full day or a specific hours window) or
--     'recurring_weekly' (e.g. never works Fridays).
--   - start_time / end_time: the hours window for a partial-day 'range' congé.
--   - weekdays: for 'recurring_weekly', the weekdays off (0=Sunday .. 6=Saturday).
-- end_date becomes nullable so a recurrence can be open-ended (no "until").
alter table public.employee_time_off
  add column if not exists kind text not null default 'range',
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists weekdays smallint[];

alter table public.employee_time_off alter column end_date drop not null;

alter table public.employee_time_off drop constraint if exists employee_time_off_kind_chk;
alter table public.employee_time_off add constraint employee_time_off_kind_chk check (
  (kind = 'range' and start_date is not null and end_date is not null)
  or (kind = 'recurring_weekly' and start_date is not null and weekdays is not null and array_length(weekdays, 1) >= 1)
);
