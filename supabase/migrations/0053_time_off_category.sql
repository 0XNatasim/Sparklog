-- Time off (congés): categorize each entry so the Congés tab can track and filter by type
-- (leave, vacation, absence, part-time schedule). Informational — no pay effect (CCQ vacation
-- indemnity stays in its own system).
alter table public.employee_time_off
  add column if not exists category text not null default 'conge';

alter table public.employee_time_off drop constraint if exists employee_time_off_category_chk;
alter table public.employee_time_off add constraint employee_time_off_category_chk
  check (category in ('conge', 'vacances', 'absence', 'temps_partiel'));
