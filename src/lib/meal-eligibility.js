import { dayDoubleTimeMinutes, isMealEligible, overtimeOptionsFromProfile } from "./payroll-calculations";

// Supper (30 $): at least 2,25 h paid at double time on a weekday, return time excluded.
// Double time depends on the whole payroll week (its first overtime hour is paid 1.5×),
// so the decision is made from the employee's jobs of that week (Sunday → Saturday).

// First and last day (YYYY-MM-DD) of the payroll week that contains `jobDate`.
export function payrollWeekRange(jobDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(jobDate || ""));
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function mealDecision(weekJobs, jobDate, profile, holidayDates = []) {
  const doubleTimeMinutes = dayDoubleTimeMinutes(weekJobs, jobDate, { ...overtimeOptionsFromProfile(profile), holidayDates });
  return { doubleTimeMinutes, eligible: isMealEligible({ jobDate, doubleTimeMinutes }) };
}
