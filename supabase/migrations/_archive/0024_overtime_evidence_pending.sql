alter table public.overtime_evidence
  drop constraint if exists overtime_evidence_ocr_status_check;

alter table public.overtime_evidence
  add constraint overtime_evidence_ocr_status_check
  check (ocr_status in ('pending', 'processed', 'needs_review', 'failed'));
