// The automatic supper claim of the employee time entry (SUPPER v3, migration 0086).
import { mealDecision } from "@/lib/meal-eligibility";
import { withTimeout } from "@/lib/utils";

// Supper: 2 h 15 of overtime (1.5× or 2×) = at least 10 h 15 of paid work that day, return time never
// counted. Decided from the employee's saved jobs of the day (this one included); one claim per day.
export async function shouldRequestMealClaim(client, { userId, jobDate, jobId }) {
  const [{ data: dayJobs, error: dayError }, { data: policy, error: policyError }] = await Promise.all([
    withTimeout(
      client.from("jobs").select("id, job_date, depart, arrivee, fin, return_time_minutes").eq("user_id", userId).eq("job_date", jobDate),
      10000
    ),
    withTimeout(
      client.from("profiles").select("first_trip_unpaid").eq("id", userId).maybeSingle(),
      10000
    ),
  ]);
  if (dayError) throw dayError;
  if (policyError) throw policyError;
  if (!mealDecision(dayJobs || [], jobDate, policy).eligible) return false;
  const { data, error } = await withTimeout(
    client.from("meal_claims").select("id").eq("user_id", userId).eq("job_date", jobDate).limit(1),
    10000
  );
  if (error) throw error;
  return (data || []).length === 0 && Boolean(jobId);
}

// The claim (30 $, pending), the job's flag and the manager notification. Throws on the first failure.
export async function createMealClaim(client, { userId, jobId, jobDate, dailyMinutes }) {
  const claimId = crypto.randomUUID();
  const { error: claimError } = await withTimeout(
    client.from("meal_claims").insert({
      id: claimId,
      user_id: userId,
      job_id: jobId,
      job_date: jobDate,
      amount: 30,
      status: "pending",
      storage_path: null,
      daily_work_minutes: dailyMinutes,
    }),
    12000
  );
  if (claimError) throw claimError;
  const { error: mealFlagError } = await withTimeout(
    client.from("jobs").update({ meal_claim_captured: true }).eq("id", jobId),
    12000
  );
  if (mealFlagError) throw mealFlagError;
  const { error: notificationError } = await withTimeout(
    client.from("manager_notifications").insert({
      type: "meal_claim",
      employee_id: userId,
      job_id: jobId,
      meal_claim_id: claimId,
      daily_minutes: dailyMinutes,
    }),
    12000
  );
  if (notificationError) throw notificationError;
}
