-- 0147: overtime proofs are read one per minute from a queue (V2.4.278).
--
-- Why: the reading service (OCR.space) answered « 429 too many requests » for most proofs (32 of 59 on 16-17 November), because
-- every proof was sent the moment it was uploaded. Now a scheduled job reads ONE proof a minute:
--   * new proofs stay `pending` (the employee's phone no longer calls the reader);
--   * the next proof read = the one never tried, then the one tried longest ago (ocr_last_try_at nulls first, then created_at);
--   * a proof the service refused goes back to the BOTTOM of the queue (its last try is now) and is not tried again for
--     10 minutes × its number of attempts; after 5 attempts it becomes `failed` (a manager can put it back with « Relire »);
--   * a claimed proof is leased for 5 minutes (ocr_next_try_at) so two runs never read the same one.
-- Replayable.
alter table public.overtime_evidence
  add column if not exists ocr_attempts integer not null default 0,
  add column if not exists ocr_last_try_at timestamptz,
  add column if not exists ocr_next_try_at timestamptz;

create index if not exists overtime_evidence_ocr_queue_idx
  on public.overtime_evidence (ocr_last_try_at nulls first, created_at)
  where ocr_status = 'pending';

-- The employee inserts his own proof row: he cannot choose its place in the queue (and still cannot write the readings).
create or replace function public.overtime_evidence_guard_proof_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.proof_ot := null;
  new.proof_client_minutes := null;
  new.proof_return_minutes := null;
  new.proof_read_at := null;
  new.ocr_attempts := 0;
  new.ocr_last_try_at := null;
  new.ocr_next_try_at := null;
  return new;
end;
$function$;

-- The next proof to read, leased for 5 minutes. Called by the Edge function (service role) only.
create or replace function public.claim_next_overtime_proof()
returns table (proof_id uuid, proof_path text, attempts_done integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  picked public.overtime_evidence%rowtype;
begin
  select * into picked
    from public.overtime_evidence e
   where e.ocr_status = 'pending'
     and e.storage_path is not null
     and (e.ocr_next_try_at is null or e.ocr_next_try_at <= now())
   order by e.ocr_last_try_at nulls first, e.created_at
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;
  update public.overtime_evidence
     set ocr_last_try_at = now(), ocr_next_try_at = now() + interval '5 minutes'
   where id = picked.id;
  return query select picked.id, picked.storage_path, picked.ocr_attempts;
end;
$function$;

revoke all on function public.claim_next_overtime_proof() from public, anon, authenticated;
grant execute on function public.claim_next_overtime_proof() to service_role;

-- « Relire » (À traiter › OCR): a manager puts proofs back in the queue (failed, found nothing, or already read empty).
create or replace function public.requeue_overtime_proofs(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  moved integer;
begin
  if (select public.get_my_role()) is distinct from 'manager' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 300 then
    raise exception using errcode = '22023', message = 'invalid_ids';
  end if;
  update public.overtime_evidence
     set ocr_status = 'pending', ocr_attempts = 0, ocr_last_try_at = null, ocr_next_try_at = null, proof_read_at = null
   where id = any (p_ids)
     and storage_path is not null
     and (expires_at is null or expires_at > now())
     and (
       ocr_status in ('failed', 'needs_review')
       or (ocr_status = 'processed' and proof_ot is null and proof_client_minutes is null and proof_return_minutes is null)
     );
  get diagnostics moved = row_count;
  return moved;
end;
$function$;

revoke all on function public.requeue_overtime_proofs(uuid[]) from public, anon;
grant execute on function public.requeue_overtime_proofs(uuid[]) to authenticated, service_role;

-- The proofs the service refused in the last two weeks (their pictures are still kept) go back in the queue.
update public.overtime_evidence
   set ocr_status = 'pending', ocr_attempts = 0, ocr_last_try_at = null, ocr_next_try_at = null, proof_read_at = null
 where ocr_status = 'failed'
   and storage_path is not null
   and created_at > now() - interval '14 days'
   and (expires_at is null or expires_at > now());

-- One reading a minute.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ocr-proofs-queue') then
    perform cron.unschedule('ocr-proofs-queue');
  end if;
end $$;

select cron.schedule('ocr-proofs-queue', '* * * * *',
  $$select public.invoke_scheduled_function('process_overtime_evidence', '{"queue": true}'::jsonb)$$);
