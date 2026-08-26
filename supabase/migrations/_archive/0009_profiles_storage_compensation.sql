-- Whether an employee receives the fixed $50 storage compensation.
alter table public.profiles
  add column if not exists storage_compensation boolean not null default false;

comment on column public.profiles.storage_compensation is
  'When true, the employee receives the fixed $50 storage compensation.';
