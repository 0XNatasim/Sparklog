const OVERLAP_ERROR = /overlapping_job_interval/i;

function interval(job) {
  if (!job?.job_date || !job?.depart || !job?.fin) return null;
  const start = Date.parse(`${job.job_date}T${String(job.depart).slice(0, 5)}:00Z`);
  let end = Date.parse(`${job.job_date}T${String(job.fin).slice(0, 5)}:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return { start, end };
}

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function isJobOverlapError(error) {
  return OVERLAP_ERROR.test(String(error?.message || error || ""));
}

// Return any existing employee job that intersects the job being edited. Catching
// saved/updated drafts here warns the employee before the database's stricter
// submitted/approved constraint has to reject the submission.
export function findJobOverlap(candidate, jobs) {
  const candidateInterval = interval(candidate);
  if (!candidateInterval) return null;

  for (const other of jobs || []) {
    if (!other || other.id === candidate.id || !["saved", "updated", "submitted", "approved"].includes(other.status)) continue;
    const otherInterval = interval(other);
    if (!otherInterval) continue;
    const overlapStart = Math.max(candidateInterval.start, otherInterval.start);
    const overlapEnd = Math.min(candidateInterval.end, otherInterval.end);
    if (overlapStart < overlapEnd) {
      return {
        candidate,
        other,
        overlapStart: timeLabel(overlapStart),
        overlapEnd: timeLabel(overlapEnd),
      };
    }
  }
  return null;
}

export function jobOverlapDetails(candidate, jobs, t) {
  const overlap = findJobOverlap(candidate, jobs);
  if (!overlap) return null;
  return t("form.errors.overlappingIntervalDetails", {
    firstOt: overlap.candidate.ot || "—",
    firstStart: String(overlap.candidate.depart).slice(0, 5),
    firstEnd: String(overlap.candidate.fin).slice(0, 5),
    secondOt: overlap.other.ot || "—",
    secondStart: String(overlap.other.depart).slice(0, 5),
    secondEnd: String(overlap.other.fin).slice(0, 5),
    overlapStart: overlap.overlapStart,
    overlapEnd: overlap.overlapEnd,
  });
}

export function jobOverlapMessage(error, candidate, jobs, t) {
  return isJobOverlapError(error) ? jobOverlapDetails(candidate, jobs, t) : null;
}
