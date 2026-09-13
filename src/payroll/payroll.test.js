import { describe, it, expect } from "vitest";
import { calculatePayroll } from "./engine/calculatePayroll.js";
import { calculateRrq } from "./statutory/rrq.js";
import { calculateEi } from "./statutory/ei.js";
import { calculateRqap } from "./statutory/rqap.js";
import { QUEBEC_2026 } from "./rules/index.js";
import { toCents } from "./money.js";

// NOTE: these assertions exercise the ENGINE's arithmetic against the current
// PLACEHOLDER rule constants (src/payroll/rules/2026.js). They verify the math and
// the cap/tier/YTD/review behavior — not tax policy. When verified 2026 figures
// replace the placeholders, the exact-dollar expectations below are expected to be
// updated alongside them; the behavioral expectations should still hold.

const rules = QUEBEC_2026;

function weekly(earnings, extra = {}) {
  return calculatePayroll({
    taxYear: 2026,
    provinceOfEmployment: "QC",
    payPeriod: { frequency: "weekly", number: 37 },
    employee: {},
    employer: { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02 },
    earnings,
    ...extra,
  });
}

describe("RRQ two-tier", () => {
  it("applies the pro-rated exemption and tier-1 rate", () => {
    const r = calculateRrq({ pensionableThisPeriod: toCents(2000), ytd: {}, periodsPerYear: 52, rules });
    // exemption/period = round(3500_00 / 52) = 6731c; contributory = 200000-6731=193269
    // employee = round(193269 * 0.063) = 12176c
    expect(r.tier1.employeeCents).toBe(12176);
    expect(r.employerCents).toBe(12176);
    expect(r.tier2.employeeCents).toBe(0);
  });

  it("stops at the tier-1 annual maximum (YTD clamp)", () => {
    const nearMax = toCents(rules.rrq.tier1.employeeMaximum) - 100; // 1$ of room left
    const r = calculateRrq({ pensionableThisPeriod: toCents(5000), ytd: { rrqEmployee: nearMax }, periodsPerYear: 52, rules });
    expect(r.tier1.employeeCents).toBe(100); // only the remaining 1.00$ is withheld
  });

  it("charges tier-2 on earnings above the YMPE band", () => {
    // YTD pensionable already past the YMPE, so this whole period is tier-2.
    const r = calculateRrq({
      pensionableThisPeriod: toCents(2000),
      ytd: { pensionableIncomeRRQ: toCents(80000) },
      periodsPerYear: 52, rules,
    });
    expect(r.tier2.employeeCents).toBe(Math.round(toCents(2000) * rules.rrq.tier2.employeeRate));
    expect(r.tier1.employeeCents).toBeGreaterThan(0); // tier-1 still applies to the pay
  });
});

describe("EI and RQAP caps", () => {
  it("EI clamps to the annual maximum", () => {
    const r = calculateEi({ insurableThisPeriod: toCents(100000), ytd: { eiEmployee: toCents(rules.ei.employeeMaximum) }, rules });
    expect(r.employeeCents).toBe(0); // already at max
  });
  it("RQAP employer rate exceeds employee rate", () => {
    const r = calculateRqap({ insurableThisPeriod: toCents(2000), ytd: {}, rules });
    expect(r.employerCents).toBeGreaterThan(r.employeeCents);
  });
});

describe("income tax", () => {
  it("is zero on zero income and positive on a normal wage", () => {
    expect(weekly([{ type: "regular", amount: 0 }]).employee.federalTax).toBe(0);
    const pay = weekly([{ type: "regular", amount: 2000 }]);
    expect(pay.employee.federalTax).toBeGreaterThan(0);
    expect(pay.employee.quebecTax).toBeGreaterThan(0);
  });
  it("is monotonic in gross pay", () => {
    const low = weekly([{ type: "regular", amount: 1000 }]);
    const high = weekly([{ type: "regular", amount: 3000 }]);
    expect(high.employee.federalTax).toBeGreaterThan(low.employee.federalTax);
    expect(high.employee.quebecTax).toBeGreaterThan(low.employee.quebecTax);
  });
  it("federal and Québec tax are computed separately (differ)", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }]);
    expect(pay.employee.federalTax).not.toBe(pay.employee.quebecTax);
  });
});

describe("engine integration", () => {
  it("net pay = cash gross − total employee deductions", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }, { type: "overtime", amount: 200 }]);
    expect(pay.gross.total).toBe(2200);
    expect(pay.employee.netPay).toBeCloseTo(2200 - pay.employee.totalDeductions, 2);
  });

  it("DAS Québec and ARC buckets add up to the DAS total", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }]);
    expect(pay.das.quebec + pay.das.arc).toBeCloseTo(pay.das.total, 2);
    // Québec bucket carries QC tax + RRQ + RQAP + FSS; ARC carries fed tax + EI.
    expect(pay.das.quebec).toBeGreaterThan(0);
    expect(pay.das.arc).toBeGreaterThan(0);
  });

  it("total payroll cost = gross + employer contributions", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }]);
    expect(pay.employer.totalPayrollCost).toBeCloseTo(pay.gross.total + pay.employer.totalContributions, 2);
  });

  it("a taxable benefit is taxed but not paid out in cash", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }, { type: "taxableBenefit", amount: 100 }]);
    expect(pay.gross.total).toBe(2100);
    expect(pay.gross.cashTotal).toBe(2000);
    // net pay is based on cash, so it never exceeds the cash paid
    expect(pay.employee.netPay).toBeLessThan(2000);
  });

  it("an expense reimbursement is subject to nothing", () => {
    const base = weekly([{ type: "regular", amount: 2000 }]);
    const withReimb = weekly([{ type: "regular", amount: 2000 }, { type: "expenseReimbursement", amount: 300 }]);
    expect(withReimb.employee.totalDeductions).toBe(base.employee.totalDeductions);
    expect(withReimb.gross.total).toBe(base.gross.total);
  });
});

describe("requires_review guards", () => {
  it("flags the draft (unvalidated) rule set", () => {
    const pay = weekly([{ type: "regular", amount: 2000 }]);
    expect(pay.requiresReview).toBe(true);
    expect(pay.reviewReasons.join(" ")).toMatch(/unvalidated|draft/i);
    expect(pay.label).toMatch(/Requires payroll review/);
  });

  it("returns requires_review (no numbers) for an unsupported year", () => {
    const pay = calculatePayroll({ taxYear: 2099, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" }, earnings: [] });
    expect(pay.requiresReview).toBe(true);
    expect(pay.gross).toBeNull();
  });

  it("returns requires_review for an unsupported province", () => {
    const pay = calculatePayroll({ taxYear: 2026, provinceOfEmployment: "ON", payPeriod: { frequency: "weekly" }, earnings: [] });
    expect(pay.requiresReview).toBe(true);
    expect(pay.gross).toBeNull();
  });

  it("flags an unknown earning type", () => {
    const pay = weekly([{ type: "mysteryPay", amount: 500 }]);
    expect(pay.reviewReasons.join(" ")).toMatch(/Unknown earning type/i);
  });

  it("flags a missing CNESST rate instead of guessing", () => {
    const pay = calculatePayroll({
      taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" },
      employer: { annualPayrollEstimate: 750000 }, // no cnesstRate
      earnings: [{ type: "regular", amount: 2000 }],
    });
    expect(pay.employer.cnesst).toBe(0);
    expect(pay.reviewReasons.join(" ")).toMatch(/CNESST/i);
  });
});

describe("YTD chaining", () => {
  it("carries pensionable/insurable forward so a second period sees the caps", () => {
    const p1 = weekly([{ type: "regular", amount: 2000 }]);
    const p2 = weekly([{ type: "regular", amount: 2000 }], { ytd: p1.ytdAfter });
    expect(p2.ytdAfter.rrqEmployee).toBeGreaterThan(p1.ytdAfter.rrqEmployee);
    expect(p2.ytdAfter.pensionableIncomeRRQ).toBeGreaterThan(p1.ytdAfter.pensionableIncomeRRQ);
  });
});
