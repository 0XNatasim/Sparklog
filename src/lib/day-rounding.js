// Loads each employee's day-rounding counter (see DAY_ROUNDING in the payroll engine) for the
// screens that compute pay. The counter runs over every day since the start date, so a
// screen showing one week still needs the days before it: this reads them once.
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { DAY_ROUNDING, buildDayRounding } from "@/lib/payroll-calculations";

// Days that count: everything entered except the employee's drafts.
export const ROUNDING_STATUSES = Object.freeze(["submitted", "updated", "approved"]);

// Map user id → buildDayRounding() result, from the start date to `untilDate` (YYYY-MM-DD).
// `profiles` (with first_trip_unpaid) avoids a second read when the caller already has them.
export async function loadDayRounding({ untilDate, userIds = null, profiles = null } = {}) {
  const until = untilDate || new Date().toISOString().slice(0, 10);
  if (until < DAY_ROUNDING.startDate) return new Map();
  const ids = userIds ? [...new Set(userIds)].filter(Boolean) : null;
  if (ids && !ids.length) return new Map();
  const [{ data: jobs, error }, people] = await Promise.all([
    fetchAllRows(() => {
      let query = supabase.from("jobs").select("id, user_id, job_date, depart, arrivee, fin, km_total, km_aller, km_retour, status")
        .in("status", ROUNDING_STATUSES)
        .gte("job_date", DAY_ROUNDING.startDate)
        .lte("job_date", until);
      if (ids) query = query.in("user_id", ids);
      return query.order("id");
    }),
    profiles ? Promise.resolve(profiles) : supabase.from("profiles").select("id, first_trip_unpaid").then((res) => res.data || []),
  ]);
  if (error) throw error;
  return roundingByUser(jobs || [], people);
}

// Pure: group jobs by employee and build each counter.
export function roundingByUser(jobs, profiles = []) {
  const tripUnpaid = new Set((profiles || []).filter((p) => p?.first_trip_unpaid).map((p) => p.id));
  const byUser = new Map();
  for (const job of jobs) {
    if (!ROUNDING_STATUSES.includes(job.status)) continue;
    if (!byUser.has(job.user_id)) byUser.set(job.user_id, []);
    byUser.get(job.user_id).push(job);
  }
  const result = new Map();
  for (const [userId, list] of byUser) result.set(userId, buildDayRounding(list, { firstTripUnpaid: tripUnpaid.has(userId) }));
  return result;
}

// One week of an employee's counter, from the days it counts (buildDayRounding): minutes worked and paid on
// those days, the week's rounding difference (paid − worked: + = paid more, − = owed to the employee) and the
// counter at the end of the week. start / end = YYYY-MM-DD, both included. `days` = 0 when no day counts yet
// (before the start date, or only drafts): nothing to show.
export function weekRoundingSummary(rounding, start, end) {
  const days = (rounding?.days || []).filter((day) => day.date >= start && day.date <= end);
  const sum = (key) => days.reduce((total, day) => total + day[key], 0);
  return { days: days.length, worked: sum("worked"), paid: sum("paid"), delta: sum("delta"), counter: days.length && rounding ? rounding.balanceAfter(end) : 0 };
}

// An employee with no counted day yet: rounding still applies, from a zero counter.
export const ZERO_ROUNDING = buildDayRounding([]);

export function roundingFor(map, userId) {
  return map?.get(userId) || ZERO_ROUNDING;
}

// "−7 min" / "+7 min" / "0 min" for screens.
export function formatRoundingMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)} min`;
}
