// The overtime proof (screenshot of the overtime request form) is PER WORK ORDER past the day's regular-hours line
// (owner decision 2026-11-17, V2.4.271, migration 0144): the job that crosses the line and every job after it, taken in time
// order, each carries its own proof. Pure rules, no network.

// First work date of the per-job rule (owner decision 2026-11-17: it starts the same day). Earlier days keep the old day-level rule (one proof per day, kept wherever it sits).
export const PER_JOB_PROOF_FROM = "2026-11-17";
export const proofPerJob = (jobDate) => String(jobDate || "").slice(0, 10) >= PER_JOB_PROOF_FROM;

// Chronological order of a day's jobs: Départ (HH:MM), then id (same tie-break as the database: byte order).
const departKey = (job) => String(job?.depart || "").slice(0, 5);
export const byDepart = (a, b) => (departKey(a) < departKey(b) ? -1 : departKey(a) > departKey(b) ? 1 : String(a.id) < String(b.id) ? -1 : 1);

// Ids of the day's jobs that go past the line (8 h of PAID time, 10 h with « 4 jours de 10 h »), the job being saved included.
// `minutesOf(job)` = its worked minutes; `unpaidTripMinutes` = the day's first trip, not paid with the « first trip unpaid »
// option (it comes off the day's first job).
export function overtimeLineJobIds(jobs, { minutesOf, thresholdMinutes = 480, unpaidTripMinutes = 0 }) {
  const ids = new Set();
  let total = 0;
  [...(jobs || [])].sort(byDepart).forEach((job, index) => {
    total += Math.max(0, minutesOf(job) - (index === 0 ? unpaidTripMinutes : 0));
    if (total > thresholdMinutes) ids.add(job.id);
  });
  return ids;
}

export const overtimeProofsRequired = (jobs, options) => overtimeLineJobIds(jobs, options).size;
