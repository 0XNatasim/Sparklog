-- 0131: « Barèmes annuels » — the yearly statutory scales the owner enters in the app (V2.4.224).
--
-- RRQ, assurance-emploi, RQAP, federal and Québec income-tax brackets, FSS, Normes du travail and FDRCMO change
-- every January. A row = one tax year's complete set (jsonb); the payroll code validates it (coherent maxima,
-- increasing brackets, consistent K constants) before using it and falls back to the coded 2026 set otherwise.
-- The browser reads with manager rights; only the owner (is_privileged(): owner + aal2) writes, through two
-- audited functions. Pay years without a row use the latest earlier set and the app says so.

create table if not exists public.statutory_rate_sets (
  tax_year   integer primary key check (tax_year between 2020 and 2100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  note       text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.statutory_rate_sets is
  'Owner-entered yearly statutory scales (Configuration › Barèmes annuels). Validated by the payroll code; the coded 2026 set is the fallback.';

alter table public.statutory_rate_sets enable row level security;

drop policy if exists "statutory_rate_sets: manager read" on public.statutory_rate_sets;
create policy "statutory_rate_sets: manager read" on public.statutory_rate_sets
  for select to authenticated using (public.get_my_role() = 'manager');
-- No insert / update / delete policy: writes go through the two functions below.

create or replace function public.set_statutory_rate_set(p_tax_year integer, p_data jsonb, p_note text default null)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
  sections constant text[] := array['rrq', 'ei', 'rqap', 'federalTax', 'quebecTax', 'fss', 'labourStandards', 'workforceFund'];
  had_row boolean;
begin
  if actor_id is null or not public.is_privileged() then
    raise exception 'statutory_rates_not_allowed' using errcode = '42501';
  end if;
  if p_tax_year is null or p_tax_year < 2020 or p_tax_year > 2100 then
    raise exception 'statutory_rates_bad_year' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_data) k where k <> all (sections))
     or exists (select 1 from unnest(sections) s where not (p_data ? s)) then
    raise exception 'statutory_rates_bad_shape' using errcode = '22023';
  end if;
  select exists (select 1 from public.statutory_rate_sets where tax_year = p_tax_year) into had_row;
  insert into public.statutory_rate_sets (tax_year, data, note, updated_at, updated_by)
  values (p_tax_year, p_data, nullif(btrim(p_note), ''), now(), actor_id)
  on conflict (tax_year) do update
     set data = excluded.data, note = excluded.note, updated_at = now(), updated_by = actor_id;

  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'statutory_rates_set', null, p_tax_year::text, null,
          jsonb_build_object('tax_year', p_tax_year, 'replaced', had_row, 'note', nullif(btrim(p_note), '')));
end;
$$;

-- Only a year that has not started can be removed (a started year sits behind real pay weeks).
create or replace function public.delete_statutory_rate_set(p_tax_year integer)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.is_privileged() then
    raise exception 'statutory_rates_not_allowed' using errcode = '42501';
  end if;
  if p_tax_year is null or p_tax_year <= extract(year from (now() at time zone 'America/Toronto'))::integer then
    raise exception 'statutory_rates_year_started' using errcode = '22023';
  end if;
  delete from public.statutory_rate_sets where tax_year = p_tax_year;
  if not found then return; end if;
  insert into public.audit_log (actor_id, actor_name, action, target_user_id, target_name, job_id, details)
  values (actor_id, public.audit_actor_name(actor_id), 'statutory_rates_deleted', null, p_tax_year::text, null,
          jsonb_build_object('tax_year', p_tax_year));
end;
$$;

revoke all on function public.set_statutory_rate_set(integer, jsonb, text) from public, anon;
grant execute on function public.set_statutory_rate_set(integer, jsonb, text) to authenticated;
revoke all on function public.delete_statutory_rate_set(integer) from public, anon;
grant execute on function public.delete_statutory_rate_set(integer) to authenticated;
