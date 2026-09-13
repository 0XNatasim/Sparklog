import { toCents, clampToRemaining, money } from "../money.js";

// Employment Insurance (EI / AE) — Québec reduced rate (spec step 6). All cents.
// Employer premium is a separate rate (typically 1.4× employee), capped at its own
// annual maximum. Withholding stops once the annual maximum is reached (YTD clamp).
export function calculateEi({ insurableThisPeriod, ytd, rules }) {
  const r = rules.ei;
  const rawEmployee = Math.round(insurableThisPeriod * r.employeeRate);
  const rawEmployer = Math.round(insurableThisPeriod * r.employerRate);
  const employee = clampToRemaining(rawEmployee, ytd?.eiEmployee || 0, toCents(r.employeeMaximum));
  const employer = clampToRemaining(rawEmployer, ytd?.eiEmployer || 0, toCents(r.employerMaximum));

  return {
    employeeCents: employee,
    employerCents: employer,
    insurableAfter: (ytd?.insurableIncomeEI || 0) + insurableThisPeriod,
    explanation: {
      module: "ei",
      insurableThisPeriod: money(insurableThisPeriod),
      employeeRate: r.employeeRate,
      employerRate: r.employerRate,
      annualMaximumEmployee: r.employeeMaximum,
      ytdBeforeEmployee: money(ytd?.eiEmployee || 0),
      employee: money(employee),
      employer: money(employer),
      maxReached: employee < rawEmployee,
    },
  };
}
