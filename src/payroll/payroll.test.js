import { describe, it, expect } from "vitest";
import { calculatePayroll } from "./engine/calculatePayroll.js";
import { calculateRrq } from "./statutory/rrq.js";
import { calculateEi } from "./statutory/ei.js";
import { calculateRqap } from "./statutory/rqap.js";
import { QUEBEC_2026 } from "./rules/index.js";
import { toCents } from "./money.js";
import { computeCcqBenefits, computeCcqLevies } from "./ccq-benefits.js";

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

  it("splits tier-1 into a creditable base and a deductible enhancement", () => {
    const r = calculateRrq({ pensionableThisPeriod: toCents(2000), ytd: {}, periodsPerYear: 52, rules });
    // base = round(193269 * 0.053) = 10243c; enhancement = tier1 - base.
    expect(r.baseCreditCents).toBe(10243);
    expect(r.enhancementDeductionCents).toBe(r.tier1.employeeCents - r.baseCreditCents);
    // The two always sum back to the (clamped) employee contribution.
    expect(r.baseCreditCents + r.enhancementDeductionCents).toBe(r.employeeCents);
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

import { printedLineAmount, printedPayLines } from "./earnings.js";

describe("pay lines printed to the cent (stubs S35, S36)", () => {
  it("S36: 38,25 h × 50,79 = 1 942,72 + 38,25 h × 4,06 = 155,30 → 2 098,02 (not 2 098,01)", () => {
    const l = printedPayLines({ regularHours: 38.25, ot200Hours: 1.5, baseRate: 50.79, premium: 4.06 });
    expect(l.regularBase).toBe(1942.72);
    expect(l.regularPremium).toBe(155.3);
    expect(l.regular).toBe(2098.02);
    expect(l.ot200).toBe(152.37);
    expect(l.overtime).toBe(152.37);
  });
  it("S35 and earlier weeks keep their printed amounts", () => {
    expect(printedPayLines({ regularHours: 36.5, baseRate: 50.79, premium: 4.06 }).regular).toBe(2002.03);
    const s15 = printedPayLines({ regularHours: 29.5, ot200Hours: 2, baseRate: 45.36, premium: 3 });
    expect(s15.regular).toBe(1426.62);
    expect(s15.ot200).toBe(181.44);
    expect(printedPayLines({ regularHours: 37.5, baseRate: 45.36, premium: 3 }).regular).toBe(1813.5);
  });
  it("temps et demi uses the rate printed to the cent (76,185 → 76,19)", () => {
    expect(printedPayLines({ ot150Hours: 2, baseRate: 50.79 }).ot150).toBe(152.38);
  });
  it("hours that are not whole hundredths (from job minutes) keep plain rounding", () => {
    expect(printedLineAmount(7.8333333, 50.79)).toBe(Math.round(7.8333333 * 50.79 * 100) / 100);
  });
});

describe("S39 (D0035-0001): 0,25 h at the base rate only, outside every CCQ base", () => {
  it("printedPayLines prices the line at 12,70 $", () => {
    expect(printedPayLines({ baseOnlyHours: 0.25, baseRate: 50.79 }).baseOnly).toBe(12.7);
  });

  it("reproduces Gains and the statutory deductions of the stub (Québec within the known cent)", () => {
    const ytdD = { rrqEmployee: 2870.88, eiEmployee: 578.31, rqapEmployee: 191.27, federalTax: 4215.72, quebecTax: 5754.2, pensionableIncomeRRQ: 47050.22, insurableIncomeEI: 44484, insurableIncomeRQAP: 44484 };
    const ytd = { grossIncome: 0, rrq2Employee: 0, rrq2Employer: 0, labourStandardsIncome: 0 };
    for (const [k, v] of Object.entries(ytdD)) ytd[k] = Math.round(v * 100);
    ytd.rrqEmployer = ytd.rrqEmployee; ytd.eiEmployer = ytd.eiEmployee; ytd.rqapEmployer = ytd.rqapEmployee;
    const hours = 41.75; // 40 régulier + 1,75 temps double; the 0,25 h is NOT a benefit hour
    const lev = computeCcqLevies({ hours, hourlyWage: 50.79, overtime200Hours: 1.75, vacationHolidaySickRate: 0.13, union: "ftq_fipoe" });
    const b = computeCcqBenefits({
      hours, safetyEquipmentHours: hours, hourlyWage: 50.79, overtime200Hours: 1.75, employeePensionRate: 0.09,
      vacationHolidaySickRate: 0.13, medicEmployeePerHour: 0.68, medicProvincialTaxRate: 0.09, union: "ftq_fipoe", level: "journeyman",
      prelevementCcq: lev.prelevementCcq, caisseEducationSyndicale: lev.caisseEducationSyndicale,
    });
    const pl = printedPayLines({ regularHours: 40, ot200Hours: 1.75, baseOnlyHours: 0.25, baseRate: 50.79, premium: 4.06 });
    const r = calculatePayroll({
      taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" },
      employee: { federalTaxProfile: { annualDeductions: b.federalDeduction * 52 }, quebecTaxProfile: {} },
      employer: { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02, workforceSkillsFundApplicable: false },
      earnings: [{ type: "regular", amount: pl.regular }, { type: "overtime", amount: pl.overtime }, { type: "regular", amount: pl.baseOnly }],
      baseAdjustments: b.baseAdjustments, ytd,
    });
    const e = r.employee;
    const gains = r.gross.total + b.vacation + b.taxableBenefit + b.employerSocialBenefit + b.safetyEquipment + 765 * 0.65 + 7;
    expect(Math.round(gains * 100) / 100).toBe(3720.86);
    expect(e.federalTax).toBe(300.2);
    expect(e.rrq.total).toBe(172.96);
    expect(e.ei).toBe(34.73);
    expect(e.rqap).toBe(11.49);
    expect(b.safetyEquipment).toBe(33.4);
    expect(Math.abs(e.quebecTax - 402.24)).toBeLessThanOrEqual(0.0100001);
  });
});
