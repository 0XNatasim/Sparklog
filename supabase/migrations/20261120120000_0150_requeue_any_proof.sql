-- 0150: a manager can put ANY reading back in the queue (V2.4.285), not only the failed / empty ones.
-- Why: a reading can be wrong without being empty (e.g. the date read as minutes, 2026-11-20), and after a fix of the reader
-- every proof should be readable again. `requeue_overtime_proofs` now accepts every proof that is not already waiting, as long
-- as its picture is still kept. Same checks as before (manager only, 1–300 ids). Replayable.
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
     and ocr_status <> 'pending';
  get diagnostics moved = row_count;
  return moved;
end;
$function$;

revoke all on function public.requeue_overtime_proofs(uuid[]) from public, anon;
grant execute on function public.requeue_overtime_proofs(uuid[]) to authenticated, service_role;
