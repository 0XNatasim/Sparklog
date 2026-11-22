-- 0158: the old way of proving overtime, a screenshot of the approval TEXT MESSAGE, is told apart (V2.4.312).
--
-- 2026-11-22: several employees still send the screenshot of the SMS they received (« Demande de temps supplémentaire approuvé. Quand
-- votre surtemps est complété remplissez se formulaire svp… ») instead of the form capture. The reader called those `wrong_document`
-- (it asked for a duration in the text, which this SMS does not carry). It now recognises the SMS wording (overtime + approved) and
-- writes `ocr_status = 'sms'`: a valid proof of the old kind, with no minutes to compare.
-- `ocr_status` gets that sixth value; « Relire » (requeue_overtime_proofs, 0150) already accepts any reading that is not queued.
-- Replayable.
alter table public.overtime_evidence drop constraint if exists overtime_evidence_ocr_status_check;
alter table public.overtime_evidence
  add constraint overtime_evidence_ocr_status_check
  check (ocr_status in ('pending', 'processed', 'needs_review', 'failed', 'wrong_document', 'sms'));
