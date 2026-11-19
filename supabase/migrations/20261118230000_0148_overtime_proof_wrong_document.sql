-- 0148: a proof that is not the overtime form can be told apart (V2.4.280).
--
-- 2026-11-18: an employee sent a work order (« Bilan » page, which carries « OT-198909 » in its header) as his overtime proof and the
-- reader called it conforming, because it found an OT number. The reader now checks that the picture IS the form (its questions
-- are there) and marks anything else `wrong_document`; the numbers read on such a picture are dropped.
-- `ocr_status` gets that fifth value; « Relire » (requeue_overtime_proofs) accepts it too, in case the reader was wrong.
-- Replayable.
alter table public.overtime_evidence drop constraint if exists overtime_evidence_ocr_status_check;
alter table public.overtime_evidence
  add constraint overtime_evidence_ocr_status_check
  check (ocr_status in ('pending', 'processed', 'needs_review', 'failed', 'wrong_document'));

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
       ocr_status in ('failed', 'needs_review', 'wrong_document')
       or (ocr_status = 'processed' and proof_ot is null and proof_client_minutes is null and proof_return_minutes is null)
     );
  get diagnostics moved = row_count;
  return moved;
end;
$function$;

revoke all on function public.requeue_overtime_proofs(uuid[]) from public, anon;
grant execute on function public.requeue_overtime_proofs(uuid[]) to authenticated, service_role;
