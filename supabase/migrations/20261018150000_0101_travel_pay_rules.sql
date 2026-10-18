-- 0101: Trajets, km et frais — one setting per employee and per line (V2.4.155, owner decision 2026-10-18,
-- NOOB.md étape 7). Recorded from Gestion › Admin › Trajets et frais; the payroll engine does not read it yet
-- (each line's default = what the app pays today, src/lib/travel-rules.js).
--
-- A row = (employee, line, effective date): the setting in force on a day is the latest row on or before it,
-- so a change never rewrites past weeks. Written only through set_travel_pay_rule (manager / owner, one audit
-- row per call, whether it targets one employee or everyone); read by manager-level roles like the other pay
-- settings (employee_tax_profiles, 0083). No SIN, no amount.

create table if not exists public.travel_pay_rules (
  user_id            uuid not null references public.profiles(id) on delete cascade,
  rule_key           text not null,
  effective_from     date not null,
  choice             text not null,
  billed_to_britton  boolean,
  threshold_km       numeric(6,1) check (threshold_km is null or (threshold_km >= 0 and threshold_km <= 1000)),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id) on delete set null,
  primary key (user_id, rule_key, effective_from),
  constraint travel_pay_rules_choice check (
    (rule_key in ('time_home_to_warehouse', 'time_home_to_first_client', 'time_warehouse_to_client',
                  'time_client_to_client', 'time_return_to_warehouse', 'time_client_to_home',
                  'time_warehouse_to_home', 'time_weekend_holiday', 'far_site_65km')
      and choice in ('ccq', 'non_ccq', 'unpaid'))
    or
    (rule_key in ('km_home_to_warehouse', 'km_home_to_first_client', 'km_warehouse_to_client',
                  'km_client_to_client', 'km_client_to_warehouse', 'km_client_to_home',
                  'km_warehouse_to_home', 'ferry', 'parking', 'supper')
      and choice in ('reimbursed', 'not_reimbursed'))
  )
);

comment on table public.travel_pay_rules is
  'Per-employee travel / km / expense rules (Gestion › Admin › Trajets et frais). Latest effective_from on or before a day is in force. Not yet read by the payroll engine.';

alter table public.travel_pay_rules enable row level security;

drop policy if exists "travel_pay_rules: manager read" on public.travel_pay_rules;
create policy "travel_pay_rules: manager read" on public.travel_pay_rules
  for select to authenticated using (public.get_my_role() = 'manager');
-- No insert / update / delete policy: writes go through set_travel_pay_rule only.

create or replace function public.set_travel_pay_rule(
  p_rule_key text,
  p_user_ids uuid[],
  p_choice text,
  p_billed_to_britton boolean,
  p_threshold_km numeric,
  p_effective_from date
) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  ids uuid[];
  written integer;
  names text;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles where id = actor_id and role in ('manager', 'owner') and not coalesce(is_paused, false)
  ) then
    raise exception 'travel_rule_not_allowed' using errcode = '42501';
  end if;
  if p_effective_from is null then
    raise exception 'travel_rule_effective_date_required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct u), '{}') into ids from unnest(coalesce(p_user_ids, '{}')) as u where u is not null;
  if cardinality(ids) = 0 or cardinality(ids) > 500 then
    raise exception 'travel_rule_no_employee' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(ids) as u where not exists (select 1 from public.profiles p where p.id = u)) then
    raise exception 'travel_rule_unknown_employee' using errcode = '22023';
  end if;

  -- The check constraint validates the line / choice pair.
  insert into public.travel_pay_rules (user_id, rule_key, effective_from, choice, billed_to_britton, threshold_km, updated_at, updated_by)
  select u, p_rule_key, p_effective_from, p_choice, p_billed_to_britton, p_threshold_km, now(), actor_id
    from unnest(ids) as u
  on conflict (user_id, rule_key, effective_from) do update
     set choice = excluded.choice,
         billed_to_britton = excluded.billed_to_britton,
         threshold_km = excluded.threshold_km,
         updated_at = now(),
         updated_by = actor_id;
  get diagnostics written = row_count;

  select string_agg(coalesce(p.full_name, p.email, p.id::text), ', ' order by p.full_name)
    into names from public.profiles p where p.id = any(ids);

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'travel_rule_set',
          case when cardinality(ids) = 1 then ids[1] end,
          case when cardinality(ids) <= 3 then names else cardinality(ids)::text || ' employés' end,
          null,
          jsonb_build_object('rule_key', p_rule_key, 'choice', p_choice, 'billed_to_britton', p_billed_to_britton,
                             'threshold_km', p_threshold_km, 'effective_from', p_effective_from,
                             'employees', cardinality(ids), 'user_ids', to_jsonb(ids)));
  return written;
end;
$$;

revoke all on function public.set_travel_pay_rule(text, uuid[], text, boolean, numeric, date) from public, anon;
grant execute on function public.set_travel_pay_rule(text, uuid[], text, boolean, numeric, date) to authenticated;
