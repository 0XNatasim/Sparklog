-- Default regulatory metadata used to build CCQ weekly JSON exports.
-- These values are copied into generated weekly records; raw jobs remain unchanged.
alter table public.profiles
  add column if not exists nas_employee text,
  add column if not exists trade_code text default '220',
  add column if not exists work_region text,
  add column if not exists wage_schedule text,
  add column if not exists hourly_rate numeric(8,2);

update public.profiles
set
  trade_code = coalesce(trade_code, '220'),
  sector = case sector
    when 'C' then 'I'
    when 'I' then 'N'
    when 'L' then 'H'
    else sector
  end;

alter table public.profiles
  drop constraint if exists profiles_nas_employee_format,
  add constraint profiles_nas_employee_format check (nas_employee is null or nas_employee ~ '^[0-9]{9}$'),
  drop constraint if exists profiles_trade_code_format,
  add constraint profiles_trade_code_format check (trade_code is null or trade_code ~ '^[0-9]{3}$'),
  drop constraint if exists profiles_work_region_format,
  add constraint profiles_work_region_format check (work_region is null or work_region ~ '^[0-9]{2}$'),
  drop constraint if exists profiles_hourly_rate_positive,
  add constraint profiles_hourly_rate_positive check (hourly_rate is null or hourly_rate >= 0),
  drop constraint if exists profiles_ccq_sector_code,
  add constraint profiles_ccq_sector_code check (sector is null or sector in ('I', 'N', 'R', 'H'));
