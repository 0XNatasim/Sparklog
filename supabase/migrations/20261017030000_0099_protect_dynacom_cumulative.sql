-- 0099: the Dynacom cumulative cannot be replaced by a calculation (V2.4.150).
--
-- Sparklog takes over payroll at CCQ week 43 (2026-10-11). Every employee's cumulative of the year up
-- to the end of week 42 was imported from Dynacom as a payroll_period_ledger row dated 2026-10-10
-- (DYNACOM_CUMULATIVE_END in src/lib/payroll-opening.js). « Comptabiliser » a week up to that date —
-- in Calcul or Paie de la semaine — would upsert a closing computed from zero over that row and lose
-- the year's cumulatives.
--
-- For rows ending on or before 2026-10-10, app users (auth.uid() set) may only:
--   * keep a REAL talon: imported (Historique de paie › import, one by one or in batch) or validated
--     against the real one (« Valider et garder »): imported_talon present and not produced by Calcul
--     (header.source <> 'calcul');
--   * change the owner's « officiel » approval (boss_approved / _by / _at), nothing else.
-- Computed closings and deletions of those rows are refused. SQL maintenance and the service role
-- (auth.uid() null) are unaffected, e.g. re-importing an updated Dynacom cumulative.

create or replace function public.protect_dynacom_cumulative()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  cutoff constant date := date '2026-10-10';
  real_stub boolean;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.period_end <= cutoff
       and (old.imported_talon is null or coalesce(old.imported_talon #>> '{header,source}', '') = 'calcul') then
      raise exception using errcode = '23514', message = 'dynacom_cumulative_locked';
    end if;
    return old;
  end if;

  if new.period_end > cutoff and (tg_op = 'INSERT' or old.period_end > cutoff) then
    return new;
  end if;

  -- Only the owner's approval changes on an existing row.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['boss_approved', 'boss_approved_by', 'boss_approved_at', 'updated_at'])
       = (to_jsonb(old) - array['boss_approved', 'boss_approved_by', 'boss_approved_at', 'updated_at']) then
    return new;
  end if;

  real_stub := new.imported_talon is not null
    and coalesce(new.imported_talon #>> '{header,source}', '') <> 'calcul';
  if not real_stub then
    raise exception using errcode = '23514', message = 'dynacom_cumulative_locked';
  end if;
  return new;
end;
$function$;

drop trigger if exists payroll_period_ledger_protect_dynacom on public.payroll_period_ledger;
create trigger payroll_period_ledger_protect_dynacom
  before insert or update or delete on public.payroll_period_ledger
  for each row execute function public.protect_dynacom_cumulative();

revoke all on function public.protect_dynacom_cumulative() from public, anon, authenticated;
