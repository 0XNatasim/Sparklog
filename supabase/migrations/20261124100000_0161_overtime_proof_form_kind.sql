-- 0161: what kind of picture each overtime proof is (V2.4.325).
--
-- The reader (Edge function process_overtime_evidence) now says what it saw, so the OCR tab can name it: « Field » (a Field Service
-- work order, page « Bilan »), « Vieux Form » (the old form « Temps réel de TS »), « SMS », or the new form. Values: new / old /
-- field / sms / other (null = not read yet). Written only by the function (service role): the guard trigger of insertion
-- (0141 / 0147) puts it back to null, so an employee cannot choose it. Replayable.

alter table public.overtime_evidence add column if not exists form_kind text;

alter table public.overtime_evidence drop constraint if exists overtime_evidence_form_kind_check;
alter table public.overtime_evidence add constraint overtime_evidence_form_kind_check
  check (form_kind is null or form_kind in ('new', 'old', 'field', 'sms', 'other'));

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
  new.form_kind := null;
  return new;
end;
$function$;
