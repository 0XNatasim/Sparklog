// Total-km field value when reopening a saved job; a real 0 km must stay "0", not blank.
export function kilometreFieldValue(job) {
  const total = Number(job?.km_total) || (Number(job?.km_aller) || 0) + (Number(job?.km_retour) || 0);
  return String(total);
}

// Overtime proof (screenshot) is requested whenever the day exceeds 8 h, both
// when saving and when submitting, from the work form or from History.
export function requiresEvidenceBeforeSave(mode) {
  return mode === "submit" || mode === "draft";
}

function workedMinutes(job) {
  if (!job?.depart || !job?.fin) return 0;
  const [startHour, startMinute] = String(job.depart).slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(job.fin).slice(0, 5).split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return end - start;
}

// Evidence is one-per-day. Include saved/updated jobs in the total so submitting
// from History cannot bypass the same >8 h rule enforced by the main form.
export function dailyOvertimeEvidenceRequirement(candidate, jobs) {
  const dayJobs = (jobs || []).filter((job) =>
    job?.job_date === candidate?.job_date
    && job.id !== candidate?.id
    && ["saved", "updated", "submitted", "approved"].includes(job.status)
  );
  const totalMinutes = workedMinutes(candidate) + dayJobs.reduce((sum, job) => sum + workedMinutes(job), 0);
  const hasEvidence = Boolean(candidate?.overtime_evidence_captured)
    || dayJobs.some((job) => job.overtime_evidence_captured);
  return { totalMinutes, required: totalMinutes > 8 * 60 && !hasEvidence };
}

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
  confirmManagerEntry = false,
}) {
  const args = {
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
  // Only sent when the employee explicitly confirms an owner-created job, so every other
  // submission keeps the exact pre-0075 call shape.
  if (confirmManagerEntry) args.p_confirm_manager_entry = true;
  return args;
}
