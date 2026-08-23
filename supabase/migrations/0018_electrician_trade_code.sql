-- Sparklog currently tracks electricians exclusively. Normalize the CCQ trade
-- code and prevent an unrelated occupation code from being saved.
update public.profiles
set trade_code = '220'
where trade_code is distinct from '220';

alter table public.profiles
  alter column trade_code set default '220',
  alter column trade_code set not null,
  drop constraint if exists profiles_trade_code_format,
  add constraint profiles_trade_code_format check (trade_code = '220');
