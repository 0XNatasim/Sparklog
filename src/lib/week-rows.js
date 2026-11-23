import dayjs from "dayjs";
import { supabase } from "@/supabaseClient";
import { hoursBetween } from "@/lib/time";
import { isOffOn } from "@/lib/timeoff";
import { fetchAllRows } from "@/lib/fetch-all";
import { loadDayRounding, roundingFor, weekRoundingSummary } from "@/lib/day-rounding";
import { dailyRegularMinutesFor, dayFirstTripUnpaidMinutes, getKilometreBreakdown, minutesBetween } from "@/lib/payroll-calculations";
import { liveRoster, notStartedOn, weekCellSummary } from "@/lib/live-crew";
import { overtimeLineJobIds, proofPerJob } from "@/lib/overtime-proof-rules";

// The data and the per-employee / per-day rows of the week overview (WeekSnapshot and the « download the week » button).

// The day's paid minutes as the database gate counts them: the Départ→Fin spans, minus the unpaid first trip for an
// employee with that option (dayFirstTripUnpaidMinutes, twin of validate_job_submission_contract).
function paidMinutes(dayJobs, firstTripUnpaid) {
  const gross = dayJobs.reduce((sum, job) => sum + (job.depart && job.fin ? minutesBetween(job.depart, job.fin) : 0), 0);
  return gross - (firstTripUnpaid ? dayFirstTripUnpaidMinutes(dayJobs) : 0);
}

export const FOREMAN_MIN_HOURS = 8;
// A counted weekday (Mon–Fri, not a holiday) under 8 h worked: the foreman is paid 8 h (display only, the pay is the engine's).
function foremanDayTopUp(date, jobCount, hours, holidays) {
  const weekday = dayjs(date).day();
  return jobCount > 0 && weekday >= 1 && weekday <= 5 && !holidays.has(date) && hours < FOREMAN_MIN_HOURS;
}

// [profiles, jobs, time off, rounding counters] of the Sunday → Saturday week.
export function loadWeekData(weekStart, weekEnd) {
  return Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, is_paused, show_on_boards, start_date, ten_hour_days, first_trip_unpaid").order("full_name"),
      // A week holds more than 1000 jobs: one request would silently drop the rest (hours missing on some days), so read it by pages.
      fetchAllRows(() => supabase.from("jobs").select("id, user_id, status, depart, arrivee, fin, job_date, km_total, km_aller, km_retour, overtime_evidence_captured").gte("job_date", weekStart).lte("job_date", weekEnd).order("id")),
      supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").lte("start_date", weekEnd).or(`end_date.gte.${weekStart},end_date.is.null`),
      // The rounding counters (15 min per day): without them the squares still show, only the paid line is missing.
      loadDayRounding({ untilDate: weekEnd }).catch(() => new Map()),
  ]);
}

export function buildWeekRows({ people, jobs, timeOff, days, holidays, rounding, weekStart }) {
    const byKey = new Map();
    jobs.forEach((job) => {
      const key = `${job.user_id}:${job.job_date}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(job);
    });
    // A new hire whose first day of work is after this week is not listed (0110).
    const roster = liveRoster(people, { jobUserIds: new Set(jobs.map((job) => job.user_id)), date: days[6] });
    return roster.map((employee) => {
      const cells = days.map((date) => {
        const dayJobs = byKey.get(`${employee.id}:${date}`) || [];
        const hours = dayJobs.reduce((sum, job) => sum + (hoursBetween(
          job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
          job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
        ) || 0), 0);
        const km = dayJobs.reduce((sum, job) => sum + getKilometreBreakdown(job).totalKm, 0);
        // Overtime proof not given yet (« Je ne l'ai pas encore »): a saved day over the daily threshold with no proof.
        // From 2026-11-16 each work order past the line needs its own proof: red when one of them has none yet.
        const proofMissing = employee.role !== "admin" && dayJobs.some((job) => job.status === "saved" || job.status === "updated")
          && (proofPerJob(date)
            ? [...overtimeLineJobIds(dayJobs, {
              minutesOf: (job) => (job.depart && job.fin ? minutesBetween(job.depart, job.fin) : 0),
              thresholdMinutes: dailyRegularMinutesFor(employee),
              unpaidTripMinutes: employee.first_trip_unpaid ? dayFirstTripUnpaidMinutes(dayJobs) : 0,
            })].some((id) => !dayJobs.find((job) => job.id === id)?.overtime_evidence_captured)
            : (!dayJobs.some((job) => job.overtime_evidence_captured)
              && paidMinutes(dayJobs, employee.first_trip_unpaid) > dailyRegularMinutesFor(employee)));
        const off = timeOff.some((row) => row.user_id === employee.id && !row.start_time && isOffOn(row, date));
        return {
          date, hours, km, off, proofMissing, holiday: holidays.has(date),
          // Foreman: a weekday (Mon–Fri, not a holiday) is paid 8 h at least (engine 2.8.0): shown next to the worked hours.
          foremanTopUp: employee.role === "foreman" && foremanDayTopUp(date, dayJobs.length, hours, holidays),
          // Days before the first day of work: nothing was expected (never « Rien d'entré »).
          notStarted: notStartedOn(employee, date),
          firstDay: employee.start_date === date,
          ...weekCellSummary(dayJobs),
        };
      });
      return {
        employee, cells, total: cells.reduce((sum, c) => sum + c.hours, 0), totalKm: cells.reduce((sum, c) => sum + c.km, 0),
        round: weekRoundingSummary(roundingFor(rounding, employee.id), weekStart, days[6]),
        hasDraft: cells.some((c) => c.status === "saved"),
        foremanPaid: employee.role === "foreman" && cells.some((c) => c.foremanTopUp)
          ? cells.reduce((sum, c) => sum + (c.foremanTopUp ? FOREMAN_MIN_HOURS : c.hours), 0) : null,
      };
    }).sort((a, b) => (a.employee.full_name || a.employee.email || "").localeCompare(b.employee.full_name || b.employee.email || ""));
}
