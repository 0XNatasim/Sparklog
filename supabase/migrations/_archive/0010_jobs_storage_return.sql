-- Travel from the completed job back to the storage shop.
alter table public.jobs
  add column if not exists return_time_minutes integer not null default 0,
  add column if not exists km_retour numeric not null default 0;

alter table public.jobs
  drop constraint if exists jobs_return_time_minutes_check,
  add constraint jobs_return_time_minutes_check
    check (return_time_minutes between 0 and 240 and return_time_minutes % 15 = 0),
  drop constraint if exists jobs_km_retour_check,
  add constraint jobs_km_retour_check check (km_retour >= 0);

comment on column public.jobs.return_time_minutes is
  'Return travel time to the storage shop, in 15-minute increments.';
comment on column public.jobs.km_retour is
  'Return distance to the storage shop in kilometres.';
