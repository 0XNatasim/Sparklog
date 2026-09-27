import { resolveJobInstants } from "./company-time";

export const RETURN_TIME_MINUTES = Object.freeze({ min: 0, max: 240, step: 5 });
export const MAX_JOB_DURATION_MINUTES = 16 * 60;

// Product choices shown in the return-time dialog. Every value must remain inside
// the broader database contract above.
export const RETURN_TIME_OPTIONS = Object.freeze([
  5, 10, 15, 20, 25, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
]);

export function isValidReturnMinutes(value) {
  if (value === null || value === undefined || value === "") return false;
  const minutes = Number(value);
  return Number.isInteger(minutes)
    && minutes >= RETURN_TIME_MINUTES.min
    && minutes <= RETURN_TIME_MINUTES.max
    && minutes % RETURN_TIME_MINUTES.step === 0;
}

function parseTimeMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function jobDurationMinutes(depart, fin) {
  const start = parseTimeMinutes(depart);
  const end = parseTimeMinutes(fin);
  if (start === null || end === null) return null;
  const elapsed = end - start;
  return elapsed <= 0 ? elapsed + 24 * 60 : elapsed;
}

export function validateJobSubmissionContract(job) {
  const errors = [];
  const duration = jobDurationMinutes(job.depart, job.fin);
  const returnMinutes = Number(job.return_time_minutes ?? 0);
  const kmTotal = Number(job.km_total ?? 0);
  const kmAller = Number(job.km_aller ?? 0);
  const kmRetour = Number(job.km_retour ?? 0);
  const instants = job.job_date
    ? resolveJobInstants(job.job_date, job.depart, job.fin)
    : null;

  if (instants && instants.status !== "valid") errors.push("invalid_dst_time");
  const actualDuration = instants?.status === "valid"
    ? (instants.end - instants.start) / 60000
    : duration;

  if (actualDuration === null || actualDuration <= 0 || actualDuration > MAX_JOB_DURATION_MINUTES) {
    errors.push("invalid_interval");
  }
  if (!isValidReturnMinutes(returnMinutes)) errors.push("invalid_return_minutes");
  if (actualDuration !== null && returnMinutes > actualDuration) errors.push("return_exceeds_interval");
  if (![kmTotal, kmAller, kmRetour].every(Number.isFinite)
      || kmTotal < 0 || kmAller < 0 || kmRetour < 0
      || kmRetour > kmTotal
      || Math.abs((kmAller + kmRetour) - kmTotal) > 0.001) {
    errors.push("invalid_kilometres");
  }
  return errors;
}
