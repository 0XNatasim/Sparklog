-- 0130: « Taux et barèmes » — payroll rates the owner changes in the app (V2.4.222).
--
-- Until now the simple rates that change yearly (MÉDIC premium and its tax, CCQ levy, education fund, pension
-- and employer social-benefit rates) were constants in the code. A row here = (rate, effective date, value): the
-- value in force on a pay week is the latest row on or before it, so a change never rewrites past weeks. The
-- coded constants stay the fallback when no row applies, so an empty table changes nothing. Wages by level are
-- NOT here: they already follow the CCQ rate sync (ccq_rate_snapshots).
--
-- Read by manager-level roles; written only through set_payroll_rate / delete_payroll_rate, which are
-- owner-only (is_privileged(): owner + aal2), bounded per rate and audited.

create table if not exists public.payroll_rates (
  rate_key       text not null,
  effective_from date not null,
  value          numeric(12,6) not null check (value >= 0),
  note           text check (note is null or char_length(note) <= 200),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  primary key (rate_key, effective_from),
  constraint payroll_rates_key check (rate_key in (
    'medic_employee_per_hour', 'medic_employer_per_hour', 'medic_tax_rate',
    'ccq_prelevement_rate', 'caisse_education_per_hour',
    'pension_rate_journeyman', 'pension_rate_apprentice',
    'social_benefit_journeyman', 'social_benefit_apprentice'))
);

comment on table public.payroll_rates is
  'Owner-editable dated payroll rates (Configuration › Taux et barèmes). Latest effective_from on or before a pay week applies; the coded constant is the fallback.';

alter table public.payroll_rates enable row level security;

drop policy if exists "payroll_rates: manager read" on public.payroll_rates;
create policy "payroll_rates: manager read" on public.payroll_rates
  for select to authenticated using (public.get_my_role() = 'manager');
-- No insert / update / delete policy: writes go through the two functions below.

create or replace function public.payroll_rate_max(p_key text)
returns numeric language sql immutable set search_path to 'public' as $$
  select case p_key
    when 'medic_employee_per_hour' then 10
    when 'medic_employer_per_hour' then 20
    when 'medic_tax_rate' then 0.3
    when 'ccq_prelevement_rate' then 0.05
    when 'caisse_education_per_hour' then 1
    when 'pension_rate_journeyman' then 0.3
    when 'pension_rate_apprentice' then 0.3
    when 'social_benefit_journeyman' then 50
    when 'social_benefit_apprentice' then 50
  end;
$$;

create or replace function public.set_payroll_rate(
  p_rate_key text,
  p_effective_from date,
  p_value numeric,
  p_note text default null
) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  max_value numeric := public.payroll_rate_max(p_rate_key);
  old_value numeric;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception 'payroll_rate_not_allowed' using errcode = '42501';
  end if;
  if max_value is null then
    raise exception 'payroll_rate_unknown_key' using errcode = '22023';
  end if;
  if p_effective_from is null or p_effective_from < date '2000-01-01' or p_effective_from > date '2100-01-01' then
    raise exception 'payroll_rate_bad_date' using errcode = '22023';
  end if;
  if p_value is null or p_value < 0 or p_value > max_value then
    raise exception 'payroll_rate_out_of_range' using errcode = '22023';
  end if;

  select value into old_value from public.payroll_rates where rate_key = p_rate_key and effective_from = p_effective_from;
  insert into public.payroll_rates (rate_key, effective_from, value, note, updated_at, updated_by)
  values (p_rate_key, p_effective_from, p_value, nullif(btrim(p_note), ''), now(), actor_id)
  on conflict (rate_key, effective_from) do update
     set value = excluded.value, note = excluded.note, updated_at = now(), updated_by = actor_id;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'payroll_rate_set', null, p_rate_key, null,
          jsonb_build_object('rate_key', p_rate_key, 'effective_from', p_effective_from,
                             'value', p_value, 'previous_value', old_value));
end;
$$;

-- Only a row that has not started yet can be removed: a row in force is history behind past pay weeks.
create or replace function public.delete_payroll_rate(p_rate_key text, p_effective_from date)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  old_value numeric;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception 'payroll_rate_not_allowed' using errcode = '42501';
  end if;
  if p_effective_from is null or p_effective_from <= (now() at time zone 'America/Toronto')::date then
    raise exception 'payroll_rate_already_in_force' using errcode = '22023';
  end if;
  delete from public.payroll_rates where rate_key = p_rate_key and effective_from = p_effective_from
    returning value into old_value;
  if not found then return; end if;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'payroll_rate_deleted', null, p_rate_key, null,
          jsonb_build_object('rate_key', p_rate_key, 'effective_from', p_effective_from, 'value', old_value));
end;
$$;

revoke all on function public.set_payroll_rate(text, date, numeric, text) from public, anon;
grant execute on function public.set_payroll_rate(text, date, numeric, text) to authenticated;
revoke all on function public.delete_payroll_rate(text, date) from public, anon;
grant execute on function public.delete_payroll_rate(text, date) to authenticated;
revoke all on function public.payroll_rate_max(text) from public, anon;
grant execute on function public.payroll_rate_max(text) to authenticated;
