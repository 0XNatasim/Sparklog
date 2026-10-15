// Employer cost of fixed weekly pay (src/lib/fixed-pay.js) for the cost screens (Coûts, Semaine/mois):
// the gross and the employer contributions from the same calculation as the talon. The opening YTD is
// not loaded here, so the annual maximums (RRQ, RQAP) are not applied — an estimate, like the rest of
// those screens. No CCQ benefits, 13 % or per-hour CCQ contributions on fixed pay.
import { computeEmployeeWeekTalon } from "@/payroll/employee-week";
import { isFixedPayWeek } from "@/lib/fixed-pay";

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const saturdayOf = (date) => addDays(date, 6 - new Date(`${date}T12:00:00Z`).getUTCDay());

// Saturdays of the CCQ weeks overlapping [start, end] (YYYY-MM-DD) that are paid at the fixed hours.
export function fixedPayWeekEnds(taxProfile, start, end) {
  const out = [];
  for (let weekEnd = saturdayOf(start); addDays(weekEnd, -6) <= end; weekEnd = addDays(weekEnd, 7)) {
    if (isFixedPayWeek(taxProfile, weekEnd)) out.push(weekEnd);
  }
  return out;
}

// One fixed-pay week: { hours, labor (gross), contribLines [{ code, label, amount }], contribTotal }.
export function fixedPayWeekCost({ profile, taxProfile, employer }) {
  const { result, hours } = computeEmployeeWeekTalon({ profile, jobs: [], taxProfile, employer, frequency: "weekly" });
  const e = result.employer;
  const contribLines = [
    ["rrq", "RRQ", e.rrq], ["ei", "AE", e.ei], ["rqap", "RQAP", e.rqap], ["fss", "FSS", e.fss],
    ["cnt", "CNT", e.labourStandards], ["cnesst", "CNESST", e.cnesst], ["fdrcmo", "FDRCMO", e.workforceFund],
  ].map(([code, label, amount]) => ({ code, label, amount: Number(amount) || 0 })).filter((line) => line.amount);
  return {
    hours: hours.totalHours,
    labor: Number(result.gross?.total) || 0,
    contribLines,
    contribTotal: contribLines.reduce((s, line) => s + line.amount, 0),
  };
}
