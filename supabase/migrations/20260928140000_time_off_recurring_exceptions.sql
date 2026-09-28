-- Time off (congés): let a recurring weekly rule (e.g. "off every Monday") except one or more
-- specific occurrences (e.g. "worked this particular Monday") without splitting the rule into
-- two recurrences around that date.
alter table public.employee_time_off
  add column if not exists exception_dates date[];

alter table public.employee_time_off drop constraint if exists employee_time_off_exception_dates_chk;
alter table public.employee_time_off add constraint employee_time_off_exception_dates_chk check (
  exception_dates is null or kind = 'recurring_weekly'
);
