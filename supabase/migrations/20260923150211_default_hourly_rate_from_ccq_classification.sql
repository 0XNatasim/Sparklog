-- Automatic hourly rate from the CCQ classification.
--
-- Context: profiles.apprentice_level defaults to 'compagnon' and profiles.wage_schedule
-- defaults to 'C3', but hourly_rate has no static default (the CCQ wage depends on the
-- level/annex and is versioned in ccq_rate_snapshots). After the P-6 audit fix the client
-- stopped writing rates as a load side effect, so employees created outside the interactive
-- classification dropdown (the signup trigger, the create_employee edge function, bulk
-- onboarding) ended up with the compagnon/C3 defaults but a NULL hourly_rate.
--
-- This derives the rate server-side from the most recent commercial-sector CCQ snapshot,
-- so the defaults actually carry the automatic wage on every creation path. It only fills a
-- NULL rate and never overwrites an explicit/manual value, so existing rows and manager
-- overrides are preserved.

create or replace function public.ccq_default_hourly_rate(p_level text, p_annex text)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with skill as (
    select case p_level
      when 'compagnon'  then '6'
      when 'apprenti_4' then '4'
      when 'apprenti_3' then '3'
      when 'apprenti_2' then '2'
      when 'apprenti_1' then '1'
      else null end as skill_id
  ),
  snap as (
    select s.raw_json::jsonb as rj
    from public.ccq_rate_snapshots s, skill
    where skill.skill_id is not null
      and s.sector_id = 'C' and s.occupation_id = '220' and s.skill_id = skill.skill_id
    order by s.fetched_at desc
    limit 1
  )
  select nullif(replace(r.value #>> '{}', ',', '.'), '')::numeric
  from snap
  cross join lateral jsonb_array_elements(rj->'AnnexesRates'->'Taux horaire') ent
  cross join lateral jsonb_each(ent->'Rates') r(key, value)
  where ent->>'Name' = 'Régulier' and r.key = p_annex
  limit 1;
$$;

revoke execute on function public.ccq_default_hourly_rate(text, text) from anon, authenticated;

create or replace function public.fill_default_hourly_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate numeric;
begin
  -- Never touch a rate that is already set (manual override or previously derived).
  if NEW.hourly_rate is not null then return NEW; end if;
  if NEW.apprentice_level is null or NEW.wage_schedule is null then return NEW; end if;
  v_rate := public.ccq_default_hourly_rate(NEW.apprentice_level, NEW.wage_schedule);
  if v_rate is not null then
    NEW.hourly_rate := v_rate;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_fill_default_hourly_rate on public.profiles;
create trigger profiles_fill_default_hourly_rate
before insert or update of apprentice_level, wage_schedule, hourly_rate on public.profiles
for each row execute function public.fill_default_hourly_rate();

-- One-time backfill: employees already created with a classification but no rate.
update public.profiles p
set hourly_rate = public.ccq_default_hourly_rate(p.apprentice_level, p.wage_schedule)
where p.hourly_rate is null
  and p.apprentice_level is not null
  and p.wage_schedule is not null
  and public.ccq_default_hourly_rate(p.apprentice_level, p.wage_schedule) is not null;
