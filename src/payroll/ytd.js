import { toCents } from "./money.js";
import { QUEBEC_2026 } from "./rules/2026.js";

// Opening year-to-date balances (dollars, employee side as stored in payroll_ytd /
// payroll_period_ledger) → the engine's `ytd` input (cents).
//
// Only the employee contributions are stored. The employer's share is derived from them:
// employer = employee × employerRate / employeeRate, capped at the employer maximum.
// RRQ rates are equal, so the employer share equals the employee's; for AE (×1,4) and
// RQAP (0,602 / 0,430) using the employee figure would let the employer premium run past
// its own annual maximum (up to ≈ 358 $ AE and 177 $ RQAP per employee per year).
function employerShare(employeeCents, { employeeRate, employerRate, employerMaximum }) {
  if (!employeeCents || !employeeRate) return 0;
  const derived = Math.round((employeeCents * employerRate) / employeeRate);
  return employerMaximum == null ? derived : Math.min(derived, toCents(employerMaximum));
}

export function engineYtdFromOpening(opening = {}, rules = QUEBEC_2026) {
  const c = (key) => toCents(opening?.[key]);
  const rrqEmployee = c("rrqEmployee");
  const rrq2Employee = c("rrq2Employee");
  const eiEmployee = c("eiEmployee");
  const rqapEmployee = c("rqapEmployee");
  return {
    grossIncome: c("grossIncome"),
    rrqEmployee,
    rrqEmployer: employerShare(rrqEmployee, rules.rrq.tier1),
    rrq2Employee,
    rrq2Employer: employerShare(rrq2Employee, rules.rrq.tier2),
    eiEmployee,
    eiEmployer: employerShare(eiEmployee, rules.ei),
    rqapEmployee,
    rqapEmployer: employerShare(rqapEmployee, rules.rqap),
    federalTax: c("federalTax"),
    quebecTax: c("quebecTax"),
    pensionableIncomeRRQ: c("pensionableIncomeRRQ"),
    insurableIncomeEI: c("insurableIncomeEI"),
    insurableIncomeRQAP: c("insurableIncomeRQAP"),
    labourStandardsIncome: c("labourStandardsIncome"),
  };
}
