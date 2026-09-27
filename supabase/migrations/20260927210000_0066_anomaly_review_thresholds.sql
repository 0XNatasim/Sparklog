-- Manager-editable thresholds for the timesheet "À vérifier" box (Test → Réglage).
-- They only flag submitted jobs for a second look; they never reject a write.
-- Read by every authenticated user and updated by managers through the existing
-- company_time_settings policies.
alter table public.company_time_settings
  add column if not exists anomaly_long_day_minutes integer not null default 720,
  add column if not exists anomaly_high_km integer not null default 300;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_time_settings_anomaly_long_day_minutes_check') then
    alter table public.company_time_settings
      add constraint company_time_settings_anomaly_long_day_minutes_check
      check (anomaly_long_day_minutes between 60 and 1440);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_time_settings_anomaly_high_km_check') then
    alter table public.company_time_settings
      add constraint company_time_settings_anomaly_high_km_check
      check (anomaly_high_km between 1 and 5000);
  end if;
end $$;
