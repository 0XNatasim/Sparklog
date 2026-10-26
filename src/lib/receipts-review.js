// Gestion V3 › À traiter › Justificatifs: which jobs still need a manager, and the employee / date filters.
// A job is « à traiter » while one of its proofs waits: a parking claim or a supper claim still pending, or
// an overtime screenshot on a job not approved yet (the proof is checked when the job is approved).

export function receiptNeedsReview(job, { parkingStatus = null, mealStatus = null, hasOvertimeProof = false } = {}) {
  if (parkingStatus === "pending" || mealStatus === "pending") return true;
  return Boolean(hasOvertimeProof) && job?.status !== "approved";
}

// `status(job)` gives { parkingStatus, mealStatus, hasOvertimeProof } for a job. Empty employee / date = all.
export function filterReceiptJobs(jobs, { pendingOnly = true, employeeId = "", date = "", status }) {
  return (jobs || []).filter((job) => {
    if (employeeId && job.user_id !== employeeId) return false;
    if (date && job.job_date !== date) return false;
    if (pendingOnly && !receiptNeedsReview(job, status(job))) return false;
    return true;
  });
}

// Employees who have at least one job in the list, by name, for the employee filter.
export function receiptEmployees(jobs, profiles) {
  const ids = [...new Set((jobs || []).map((job) => job.user_id))];
  return ids
    .map((id) => {
      const profile = profiles.get(id);
      return { id, name: profile?.full_name || profile?.email || `${String(id).slice(0, 8)}…` };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr-CA", { sensitivity: "base" }));
}
