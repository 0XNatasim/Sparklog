// Rapports › Semaine / Mois: the employees' weekly costs (src/lib/employer-cost.js) grouped by CCQ week
// or by CCQ monthly period (ends the last Saturday of the month).
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { jobCodeKind } from "@/lib/job-code";
import { monthlyReportPeriod } from "@/lib/monthly-report-period";

dayjs.extend(isoWeek);

// CCQ week: Sunday → Saturday, keyed by the ending Saturday.
export function ccqWeek(dateStr) {
  const d = dayjs(dateStr);
  const end = d.add((6 - d.day() + 7) % 7, "day");
  return { key: end.format("YYYY-MM-DD"), end, start: end.subtract(6, "day") };
}

// The period a job date belongs to: a CCQ week, or a monthly report period
// (ends the last Saturday of the month). Returns dayjs start/end + a string key.
export function periodFor(mode, dateStr) {
  if (mode === "month") {
    const p = monthlyReportPeriod(dateStr);
    return { key: p.key, start: dayjs(p.start), end: dayjs(p.end) };
  }
  return ccqWeek(dateStr);
}

// The CCQ weeks or monthly periods of the range, each the sum of the employees' weekly costs computed
// like the talons (src/lib/employer-cost.js): same hours, gross pay, 13 % and employer contributions.
export function periodsFromWeeklyCosts(rows, mode, t) {
  const buckets = new Map();
  for (const row of rows) {
    const p = periodFor(mode, row.weekEnd);
    if (!buckets.has(p.key)) {
      buckets.set(p.key, {
        ...p, users: new Set(), jobs: [], workedMinutes: 0, otJobs: 0, labor: 0, conges: 0, contribTotal: 0,
        km: 0, supper: 0, parking: 0, phone: 0, storage: 0, safety: 0,
      });
    }
    const b = buckets.get(p.key);
    b.users.add(row.userId);
    b.jobs.push(...row.jobs);
    b.workedMinutes += row.minutes.worked;
    b.otJobs += row.otJobs;
    b.labor += row.labor; b.conges += row.conges; b.contribTotal += row.contribTotal;
    b.km += row.km; b.supper += row.meals; b.parking += row.parking; b.phone += row.phone; b.storage += row.storage; b.safety += row.safety;
  }
  return [...buckets.values()]
    .map((b) => {
      const expenses = b.km + b.supper + b.parking + b.phone + b.storage + b.safety;
      return {
        key: b.key,
        title: mode === "month" ? b.end.format("MMMM YYYY") : `${t("manager.weekShort")} ${b.end.isoWeek()}`,
        start: b.start,
        end: b.end,
        activeEmployees: b.users.size,
        totalHours: b.workedMinutes / 60,
        otJobs: b.otJobs,
        jobJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "project").length,
        adJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "admin").length,
        labor: b.labor, conges: b.conges, contribTotal: b.contribTotal,
        km: b.km, supper: b.supper, parking: b.parking, phone: b.phone, storage: b.storage, safety: b.safety,
        expenses,
        total: b.labor + b.conges + b.contribTotal + expenses,
      };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}
