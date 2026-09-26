// Keep the client-to-RPC contract explicit. Ownership, status and lock state are
// deliberately absent: save_own_job derives those security-sensitive values server-side.
export function buildJobSaveRpcArgs({
  editId,
  newJobId,
  submissionKey,
  submit,
  jobDate,
  ot,
  depart,
  arrivee,
  fin,
  kmTotal,
  kmAller,
  returnMinutes,
  kmRetour,
  overtimeEvidenceCaptured,
  parkingReceiptCaptured,
}) {
  return {
    p_job_id: editId || null,
    p_new_job_id: editId ? null : (newJobId || null),
    p_submission_key: editId ? null : submissionKey,
    p_submit: Boolean(submit),
    p_job_date: jobDate,
    p_ot: ot,
    p_depart: depart || null,
    p_arrivee: arrivee || null,
    p_fin: fin || null,
    p_km_total: kmTotal,
    p_km_aller: kmAller,
    p_return_time_minutes: returnMinutes ?? 0,
    p_km_retour: kmRetour ?? 0,
    p_overtime_evidence_captured: Boolean(overtimeEvidenceCaptured),
    p_parking_receipt_captured: Boolean(parkingReceiptCaptured),
  };
}

