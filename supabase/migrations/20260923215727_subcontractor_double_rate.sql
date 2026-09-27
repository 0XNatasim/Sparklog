-- Subcontractor double-time billing rate.
--
-- Subcontractors are billed by the trade, not payrolled: they carry a negotiated pair of
-- rates — a simple rate (profiles.hourly_rate) and a double-time rate for hours over 8h/day.
-- The double rate is not necessarily 2x the simple one, so it is stored explicitly.
alter table public.profiles add column if not exists hourly_rate_double numeric;
comment on column public.profiles.hourly_rate_double is
  'Subcontractor double-time billing rate ($/h), negotiated (not necessarily 2x hourly_rate). Null for CCQ employees, who use the CCQ grid.';

-- The CCQ auto-rate default only makes sense for CCQ tradespeople. Never derive a grid rate
-- for non-CCQ roles (owner/admin/subcontractor) — their pay is flat or negotiated.
create or replace function public.fill_default_hourly_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate numeric;
begin
  if NEW.role is distinct from 'employee' then return NEW; end if;
  if NEW.hourly_rate is not null then return NEW; end if;
  if NEW.apprentice_level is null or NEW.wage_schedule is null then return NEW; end if;
  v_rate := public.ccq_default_hourly_rate(NEW.apprentice_level, NEW.wage_schedule);
  if v_rate is not null then
    NEW.hourly_rate := v_rate;
  end if;
  return NEW;
end;
$$;
