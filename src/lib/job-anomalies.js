import { getKilometreBreakdown, minutesBetween } from "./payroll-calculations";

// Thresholds for the manager's "À vérifier" box. These only flag a job for a second
// look before approval; the database contract still decides what is accepted.
export const ANOMALY_LIMITS = Object.freeze({
  longDayMinutes: 12 * 60,
  highKm: 300,
  overtimeMinutes: 8 * 60,
});

const REVIEWABLE = new Set(["submitted", "approved"]);

function naiveMinutes(job, time) {
  return Date.parse(`${String(job.job_date).slice(0, 10)}T${String(time).slice(0, 5)}:00Z`) / 60000;
}

// Resolved instants when both jobs have them; otherwise the civil times of the work
// date, wrapping past midnight like the payroll engine.
function interval(job, useInstants) {
  if (useInstants) return [Date.parse(job.started_at) / 60000, Date.parse(job.ended_at) / 60000];
  const start = naiveMinutes(job, job.depart);
  return [start, start + minutesBetween(job.depart, job.fin)];
}

function hasInstants(job) {
  return Boolean(job.started_at && job.ended_at);
}

function sameEntry(a, b) {
  const code = (job) => String(job.ot || "").trim().toLowerCase();
  const time = (value) => String(value || "").slice(0, 5);
  return code(a) === code(b) && time(a.depart) === time(b.depart) && time(a.fin) === time(b.fin);
}

// Submitted jobs first, so the line opens the job the manager can still act on.
function orderedIds(...jobs) {
  return jobs
    .slice()
    .sort((a, b) => (a.status === "submitted" ? 0 : 1) - (b.status === "submitted" ? 0 : 1))
    .map((job) => job.id);
}

// Pure detection over submitted/approved jobs. Only anomalies that touch at least one
// submitted job are returned: approved days are already settled.
export function detectJobAnomalies(jobs) {
  const days = new Map();
  for (const job of jobs || []) {
    if (!REVIEWABLE.has(job.status) || !job.user_id || !job.job_date || !job.depart || !job.fin) continue;
    const key = `${job.user_id}|${job.job_date}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(job);
  }

  const anomalies = [];
  const add = (type, dayJobs, extra = {}) => {
    if (!dayJobs.some((job) => job.status === "submitted")) return;
    const [first] = dayJobs;
    const jobIds = orderedIds(...dayJobs);
    anomalies.push({ key: `${type}:${jobIds.join(",")}`, type, userId: first.user_id, jobDate: first.job_date, jobIds, ...extra });
  };

  for (const dayJobs of days.values()) {
    dayJobs.sort((a, b) => String(a.depart).localeCompare(String(b.depart)));

    for (let i = 0; i < dayJobs.length; i += 1) {
      for (let j = i + 1; j < dayJobs.length; j += 1) {
        const a = dayJobs[i];
        const b = dayJobs[j];
        if (sameEntry(a, b)) {
          add("duplicate", [a, b], { ot: a.ot || "", depart: a.depart, fin: a.fin });
          continue;
        }
        const useInstants = hasInstants(a) && hasInstants(b);
        const [aStart, aEnd] = interval(a, useInstants);
        const [bStart, bEnd] = interval(b, useInstants);
        const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
        if (overlap > 0) add("overlap", [a, b], { minutes: Math.round(overlap) });
      }
    }

    const worked = dayJobs.reduce((sum, job) => sum + minutesBetween(job.depart, job.fin), 0);
    if (worked > ANOMALY_LIMITS.longDayMinutes) add("long_day", dayJobs, { minutes: worked });
    if (worked > ANOMALY_LIMITS.overtimeMinutes && !dayJobs.some((job) => job.overtime_evidence_captured)) {
      add("overtime_no_evidence", dayJobs, { minutes: worked });
    }

    for (const job of dayJobs) {
      const { totalKm } = getKilometreBreakdown(job);
      if (totalKm > ANOMALY_LIMITS.highKm) add("high_km", [job], { km: totalKm });
    }
  }

  return anomalies.sort((a, b) => b.jobDate.localeCompare(a.jobDate) || String(a.userId).localeCompare(String(b.userId)));
}

// Anomalies that touch any of the given job ids (a batch about to be approved).
export function anomaliesForJobs(anomalies, jobIds) {
  const ids = new Set(jobIds);
  return anomalies.filter((anomaly) => anomaly.jobIds.some((id) => ids.has(id)));
}
