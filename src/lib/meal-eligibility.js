import { dayWorkMinutesWithoutReturn, getKilometreBreakdown, isMealEligible, minutesBetween } from "./payroll-calculations";

// Supper (30 $): 2 h 15 of overtime in the day (1.5× or 2×, both count) = at least 10 h 15
// of paid work on a weekday, return time never counted. Decided from the day's jobs.
export function mealDecision(dayJobs, jobDate, profile) {
  const dailyWorkMinutes = dayWorkMinutesWithoutReturn(dayJobs, { firstTripUnpaid: Boolean(profile?.first_trip_unpaid) });
  return { dailyWorkMinutes, eligible: isMealEligible({ jobDate, dailyWorkMinutes }) };
}

// What a manager needs to check a supper: the day's presence (Départ→Fin), the return time and
// its kilometres taken out, the unpaid first trip if any, and the work that decides — the same
// minutes as mealDecision and reconcile_overtime_meal.
export function mealDayBreakdown(dayJobs, jobDate, profile) {
  const jobs = (dayJobs || []).filter((job) => job?.depart && job?.fin);
  let presenceMinutes = 0;
  let returnMinutes = 0;
  let totalKm = 0;
  let returnKm = 0;
  for (const job of jobs) {
    const span = minutesBetween(job.depart, job.fin);
    presenceMinutes += span;
    returnMinutes += Math.min(Math.max(0, Number(job.return_time_minutes) || 0), span);
    const km = getKilometreBreakdown(job);
    totalKm += km.totalKm;
    returnKm += km.returnKm;
  }
  const { dailyWorkMinutes, eligible } = mealDecision(jobs, jobDate, profile);
  return {
    presenceMinutes,
    returnMinutes,
    unpaidTripMinutes: Math.max(0, presenceMinutes - returnMinutes - dailyWorkMinutes),
    workMinutes: dailyWorkMinutes,
    totalKm,
    returnKm,
    eligible,
  };
}

// "Travail 10h15 = présence 11h15 − retour 1h00 (104 km) · 151 km dans la journée"
export function mealBreakdownText(t, b, formatMinutes) {
  const hm = (minutes) => formatMinutes(minutes / 60);
  const parts = [t("meal.check.work", { work: hm(b.workMinutes) })];
  if (b.returnMinutes > 0 || b.unpaidTripMinutes > 0) {
    let detail = `= ${t("meal.check.presence", { presence: hm(b.presenceMinutes) })}`;
    if (b.returnMinutes > 0) detail += ` − ${t("meal.check.return", { time: hm(b.returnMinutes), km: Math.round(b.returnKm) })}`;
    if (b.unpaidTripMinutes > 0) detail += ` − ${t("meal.check.firstTrip", { time: hm(b.unpaidTripMinutes) })}`;
    parts.push(detail);
  }
  return `${parts.join(" ")} · ${t("meal.check.dayKm", { km: Math.round(b.totalKm) })}`;
}
