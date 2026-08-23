-- Sparklog currently operates exclusively in the institutional/commercial sector.
-- Normalize legacy classifications and prevent unsupported sector values going forward.
update public.profiles
set sector = 'I'
where sector is distinct from 'I';

alter table public.profiles
  alter column sector set default 'I',
  alter column sector set not null,
  drop constraint if exists profiles_ccq_sector_code,
  add constraint profiles_ccq_sector_code check (sector = 'I');
