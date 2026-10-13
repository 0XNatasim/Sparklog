import { dayWorkMinutesWithoutReturn, isMealEligible } from "./payroll-calculations";

// Supper (30 $): 2 h 15 of overtime in the day (1.5× or 2×, both count) = at least 10 h 15
// of paid work on a weekday, return time never counted. Decided from the day's jobs.
export function mealDecision(dayJobs, jobDate, profile) {
  const dailyWorkMinutes = dayWorkMinutesWithoutReturn(dayJobs, { firstTripUnpaid: Boolean(profile?.first_trip_unpaid) });
  return { dailyWorkMinutes, eligible: isMealEligible({ jobDate, dailyWorkMinutes }) };
}
