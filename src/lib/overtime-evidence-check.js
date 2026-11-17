// The overtime request (screenshot of the request form) of the employee time entry: whether the day needs one,
// and the upload of the picture.
import { hoursBetween } from "@/lib/time";
import { evidenceUploadFailure } from "@/lib/evidence-file";
import { refreshSessionOnce, withRetry, withTimeout } from "@/lib/utils";
import { dayFirstTripUnpaidMinutes } from "@/lib/payroll-calculations";
import { makeDayjsFromJob } from "@/lib/employee-form-helpers";

// Chronological order of a day's jobs: Départ (HH:MM), then id (same tie-break as the database: byte order).
const departKey = (job) => String(job?.depart || "").slice(0, 5);
const byDepart = (a, b) => (departKey(a) < departKey(b) ? -1 : departKey(a) > departKey(b) ? 1 : String(a.id) < String(b.id) ? -1 : 1);

// How many of the day's jobs go past the overtime line (8 h of PAID time, 10 h with « 4 jours de 10 h »), jobs taken in
// chronological order: the one that crosses the line and every job after it. Each of them needs its own screenshot of the
// overtime request form (owner decision 2026-11-17, V2.4.269). `jobs` = every job of the day, the one being saved included;
// `minutesOf(job)` = its worked minutes; `unpaidTripMinutes` = the day's first trip, not paid with the « first trip unpaid »
// option (it comes off the day's first job).
export function overtimeProofsRequired(jobs, { minutesOf, thresholdMinutes = 480, unpaidTripMinutes = 0 }) {
  let total = 0;
  let required = 0;
  [...(jobs || [])].sort(byDepart).forEach((job, index) => {
    total += Math.max(0, minutesOf(job) - (index === 0 ? unpaidTripMinutes : 0));
    if (total > thresholdMinutes) required += 1;
  });
  return required;
}

// A screenshot per work order past the line. Returns { needed, paidDayMinutes, required, proofCount }: `needed` is true while
// the day holds fewer proofs than work orders past the line. The proofs of the day are counted in overtime_evidence (they all
// sit on the day's last job). Fails closed: without the other jobs we cannot know how many the day needs, so a load error is
// thrown.
export async function overtimeEvidenceNeeded(client, { userId, jobDate, editId, thisMinutes, current, firstTripUnpaid, dailyRegularMinutes = 480 }) {
  // Retry (with a session refresh + backoff) so a Supabase cold start doesn't fail the check on the
  // first slow attempt.
  const [{ data: dayJobs }, { data: proofs }] = await Promise.all([
    withRetry(
      () => client.from("jobs").select("id, job_date, depart, arrivee, fin, km_total, km_aller, km_retour").eq("user_id", userId).eq("job_date", jobDate),
      8000,
      { retries: 2 }
    ),
    withRetry(() => client.from("overtime_evidence").select("id").eq("user_id", userId).eq("job_date", jobDate), 8000, { retries: 2 }),
  ]);
  const workedMinutes = (job) => {
    const start = makeDayjsFromJob(jobDate, job.depart);
    const end = makeDayjsFromJob(jobDate, job.fin);
    return Math.round((hoursBetween(start, end) || 0) * 60);
  };
  const others = (dayJobs || []).filter((job) => job.id !== editId);
  // Return-to-storage time is deliberately excluded: it is always paid at the regular rate and never
  // creates overtime or supper eligibility.
  const fullDayMinutes = others.reduce((total, job) => total + workedMinutes(job), 0) + thisMinutes;
  const thisJob = { id: editId || "current", ...current };
  // With the "first trip unpaid" option the day's first Départ→Arrivée trip is not paid: supper
  // eligibility, the overtime threshold and the stored daily total all use PAID time (same rule as
  // the payroll and the database).
  const unpaidTrip = firstTripUnpaid ? dayFirstTripUnpaidMinutes([...others, thisJob]) : 0;
  const paidDayMinutes = fullDayMinutes - unpaidTrip;
  const required = overtimeProofsRequired([...others, thisJob], {
    minutesOf: (job) => (job.id === thisJob.id ? thisMinutes : workedMinutes(job)),
    thresholdMinutes: dailyRegularMinutes,
    unpaidTripMinutes: unpaidTrip,
  });
  const proofCount = (proofs || []).length;
  return { needed: required > proofCount, paidDayMinutes, required, proofCount };
}

// Uploads the screenshot; on an expired session, timeout or network drop it refreshes the session and
// retries once. A duplicate on the retry means the first attempt did commit.
export async function uploadOvertimeEvidence(client, path, image) {
  const attempt = () => withTimeout(
    client.storage.from("overtime-evidence").upload(path, image, { contentType: "image/jpeg", upsert: false }),
    20000
  );
  try {
    const { error } = await attempt();
    if (error) throw error;
  } catch (firstError) {
    if (!["auth", "timeout", "network"].includes(evidenceUploadFailure(firstError).key)) throw firstError;
    await refreshSessionOnce();
    const { error } = await attempt();
    const duplicate = Number(error?.statusCode ?? error?.status) === 409 || /already exists|duplicate/i.test(error?.message || "");
    if (error && !duplicate) throw error;
  }
}
