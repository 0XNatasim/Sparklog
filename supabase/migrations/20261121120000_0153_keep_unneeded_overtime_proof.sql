-- 0153: an overtime proof that is no longer needed is kept, not deleted (V2.4.296).
--
-- Until now reconcile_overtime_evidence (0068) DELETED every proof of a day as soon as the day's minutes fell back to 8 h or
-- less (a sheet edited, deleted or moved). The proof picture was lost. Owner decision 2026-11-21: keep it, and only mark it
-- as not needed. overtime_evidence.not_needed_at = since when the day is under the line (null = needed or unknown); it goes back
-- to null if the day passes the line again. The proof keeps its place in the retention / cleanup cycle (expires_at), its reading
-- and its flag on the job (overtime_evidence_captured is no longer reset). Existing rows of days already under the line are marked.
-- Replayable.

alter table public.overtime_evidence
  add column if not exists not_needed_at timestamptz;

create or replace function public.reconcile_overtime_evidence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p_user uuid;
  p_date date;
begin
  if tg_op = 'DELETE' then
    p_user := old.user_id;
    p_date := old.job_date;
  else
    p_user := new.user_id;
    p_date := new.job_date;
  end if;

  if public.overtime_day_minutes(p_user, p_date) <= 480 then
    -- Under the line: the proof is useless but kept.
    update public.overtime_evidence
       set not_needed_at = coalesce(not_needed_at, now())
     where user_id = p_user and job_date = p_date and not_needed_at is null;
  else
    update public.overtime_evidence
       set not_needed_at = null
     where user_id = p_user and job_date = p_date and not_needed_at is not null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- Only the server decides that a proof is not needed: a row inserted by the browser always starts as « needed / unknown ».
create or replace function public.overtime_evidence_clear_not_needed()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.not_needed_at := null;
  return new;
end;
$function$;

drop trigger if exists overtime_evidence_clear_not_needed on public.overtime_evidence;
create trigger overtime_evidence_clear_not_needed
  before insert on public.overtime_evidence
  for each row execute function public.overtime_evidence_clear_not_needed();

-- Days already under the line (their proofs may have survived, or been put back by hand).
update public.overtime_evidence e
   set not_needed_at = now()
 where e.not_needed_at is null
   and public.overtime_day_minutes(e.user_id, e.job_date) <= 480;
