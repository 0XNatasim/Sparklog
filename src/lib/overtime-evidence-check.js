// The overtime authorization (SMS screenshot) of the employee time entry: whether the day needs one,
// and the upload of the picture.
import { hoursBetween } from "@/lib/time";
import { evidenceUploadFailure } from "@/lib/evidence-file";
import { refreshSessionOnce, withRetry, withTimeout } from "@/lib/utils";
import { dayFirstTripUnpaidMinutes } from "@/lib/payroll-calculations";
import { makeDayjsFromJob } from "@/lib/employee-form-helpers";

// One screenshot per day once the WHOLE day (all of the employee's jobs, this one included) passes
// 8 h of paid time — not this job's running total. Returns { needed, paidDayMinutes }; paidDayMinutes
// is null when the job already carries its proof (nothing computed). Fails closed: without the other
// jobs we cannot prove that the day is at or below 8 h, so a load error is thrown.
export async function overtimeEvidenceNeeded(client, { userId, jobDate, editId, thisMinutes, current, hasOvertimeEvidence, firstTripUnpaid }) {
  // Retry (with a session refresh + backoff) so a Supabase cold start doesn't fail the check on the
  // first slow attempt.
  const { data: dayJobs } = await withRetry(
    () => client.from("jobs").select("id, job_date, depart, arrivee, fin, km_total, km_aller, km_retour, overtime_evidence_captured").eq("user_id", userId).eq("job_date", jobDate),
    8000,
    { retries: 2 }
  );
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
  // If another job today already has the authorization, don't ask again for this one. The manager
  // also sees an "8h+, no evidence" flag at approval for jobs entered out of order.
  if (others.some((job) => job.overtime_evidence_captured)) return { needed: false, paidDayMinutes };
  return { needed: paidDayMinutes > 480, paidDayMinutes };
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
