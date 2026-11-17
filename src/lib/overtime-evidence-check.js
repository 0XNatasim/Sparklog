// The overtime request (screenshot of the request form) of the employee time entry: whether the day needs one,
// and the upload of the picture.
import { hoursBetween } from "@/lib/time";
import { evidenceUploadFailure } from "@/lib/evidence-file";
import { refreshSessionOnce, withRetry, withTimeout } from "@/lib/utils";
import { dayFirstTripUnpaidMinutes } from "@/lib/payroll-calculations";
import { makeDayjsFromJob } from "@/lib/employee-form-helpers";
import { overtimeLineJobIds, overtimeProofsRequired, proofPerJob } from "@/lib/overtime-proof-rules";

export { overtimeLineJobIds, overtimeProofsRequired };

// Whether this save needs an overtime screenshot. From 2026-11-18 (PER_JOB_PROOF_FROM): one per work order past the line, so
// the job being saved needs its OWN proof when it crosses or follows the line (a job already carrying its proof, `hasOvertimeEvidence`,
// is not asked again). Earlier days keep the day-level rule: one proof per day, asked while the day passes the line and no job
// of the day carries it. Returns { needed, paidDayMinutes }; paidDayMinutes is null when nothing was computed. Fails closed:
// without the other jobs we cannot know where the line falls, so a load error is thrown.
export async function overtimeEvidenceNeeded(client, { userId, jobDate, editId, thisMinutes, current, hasOvertimeEvidence, firstTripUnpaid, dailyRegularMinutes = 480 }) {
  // Retry (with a session refresh + backoff) so a Supabase cold start doesn't fail the check on the
  // first slow attempt.
  const { data: dayJobs } = await withRetry(
    () => client.from("jobs").select("id, job_date, depart, arrivee, fin, km_total, km_aller, km_retour, overtime_evidence_captured").eq("user_id", userId).eq("job_date", jobDate),
    8000,
    { retries: 2 }
  );
  const perJob = proofPerJob(jobDate);
  if (editId && hasOvertimeEvidence) return { needed: false, paidDayMinutes: null };
  const workedMinutes = (job) => {
    const start = makeDayjsFromJob(jobDate, job.depart);
    const end = makeDayjsFromJob(jobDate, job.fin);
    return Math.round((hoursBetween(start, end) || 0) * 60);
  };
  const others = (dayJobs || []).filter((job) => job.id !== editId);
  // Return-to-storage time is deliberately excluded: it is always paid at the regular rate and never
  // creates overtime or supper eligibility.
  const fullDayMinutes = others.reduce((total, job) => total + workedMinutes(job), 0) + thisMinutes;
  // With the "first trip unpaid" option the day's first Départ→Arrivée trip is not paid: supper
  // eligibility, the overtime threshold and the stored daily total all use PAID time (same rule as
  // the payroll and the database).
  const unpaidTrip = firstTripUnpaid
    ? dayFirstTripUnpaidMinutes([...others, { id: editId || "current", ...current }])
    : 0;
  const paidDayMinutes = fullDayMinutes - unpaidTrip;
  if (perJob) {
    const thisJob = { id: editId || "current", ...current };
    const overLine = overtimeLineJobIds([...others, thisJob], {
      minutesOf: (job) => (job.id === thisJob.id ? thisMinutes : workedMinutes(job)),
      thresholdMinutes: dailyRegularMinutes,
      unpaidTripMinutes: unpaidTrip,
    });
    return { needed: overLine.has(thisJob.id), paidDayMinutes };
  }
  // If another job today already has the authorization, don't ask again for this one. The manager
  // also sees an "8h+, no evidence" flag at approval for jobs entered out of order.
  if (others.some((job) => job.overtime_evidence_captured)) return { needed: false, paidDayMinutes };
  return { needed: paidDayMinutes > dailyRegularMinutes, paidDayMinutes };
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
