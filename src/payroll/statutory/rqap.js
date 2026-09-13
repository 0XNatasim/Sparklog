import { toCents, clampToRemaining, money } from "../money.js";

// RQAP / QPIP (spec step 7). All cents. Same YTD-cap mechanics as EI.
export function calculateRqap({ insurableThisPeriod, ytd, rules }) {
  const r = rules.rqap;
  const rawEmployee = Math.round(insurableThisPeriod * r.employeeRate);
  const rawEmployer = Math.round(insurableThisPeriod * r.employerRate);
  const employee = clampToRemaining(rawEmployee, ytd?.rqapEmployee || 0, toCents(r.employeeMaximum));
  const employer = clampToRemaining(rawEmployer, ytd?.rqapEmployer || 0, toCents(r.employerMaximum));

  return {
    employeeCents: employee,
    employerCents: employer,
    insurableAfter: (ytd?.insurableIncomeRQAP || 0) + insurableThisPeriod,
    explanation: {
      module: "rqap",
      insurableThisPeriod: money(insurableThisPeriod),
      employeeRate: r.employeeRate,
      employerRate: r.employerRate,
      annualMaximumEmployee: r.employeeMaximum,
      ytdBeforeEmployee: money(ytd?.rqapEmployee || 0),
      employee: money(employee),
      employer: money(employer),
      maxReached: employee < rawEmployee,
    },
  };
}
