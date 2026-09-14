-- 0038: CCQ congés (vacation / statutory-holiday / sick) indemnity rate in the DB.
--
-- The 13% indemnity split (6% vacation + 5.5% statutory holidays + 1.5% sick) was
-- hard-coded in two engines. This single-row table becomes the source of truth the
-- ESTIMATE views (Costing, Week, Month) read, so the rate is managed in one place.
--
-- Scope guard (ADR 0001 / payroll-rule gate): this feeds LABELED ESTIMATES only.
-- The authoritative approval/export path keeps its versioned code constant
-- (CONGES_INDEMNITY_RATES in the shared payroll engine), so editing this row can
-- never silently change finalized pay. Value seeded = the existing 13% split.
-- Source: CCQ chèque-vacances; see docs/rules/compensation-rules.md.

create table if not exists public.conges_indemnity_rate (
  id                 boolean primary key default true check (id),
  vacation           numeric not null default 0.06,
  statutory_holidays numeric not null default 0.055,
  sick               numeric not null default 0.015,
  source             text,
  effective_from     date,
  updated_at         timestamptz not null default now()
);

alter table public.conges_indemnity_rate enable row level security;

drop policy if exists "conges_indemnity_rate: manager read" on public.conges_indemnity_rate;
create policy "conges_indemnity_rate: manager read" on public.conges_indemnity_rate
  for select to authenticated using (public.get_my_role() = 'manager');
drop policy if exists "conges_indemnity_rate: manager write" on public.conges_indemnity_rate;
create policy "conges_indemnity_rate: manager write" on public.conges_indemnity_rate
  for all to authenticated using (public.get_my_role() = 'manager') with check (public.get_my_role() = 'manager');

drop trigger if exists conges_indemnity_rate_set_updated_at on public.conges_indemnity_rate;
create trigger conges_indemnity_rate_set_updated_at
  before update on public.conges_indemnity_rate
  for each row execute function public.set_updated_at();

insert into public.conges_indemnity_rate (id, vacation, statutory_holidays, sick, source)
values (true, 0.06, 0.055, 0.015, 'CCQ chèque-vacances; docs/rules/compensation-rules.md')
on conflict (id) do nothing;
