import { describe, it, expect } from "vitest";
import { computeCcqBenefits, CCQ_ELECTRICIAN_IC_C3 } from "./ccq-benefits.js";
import { calculatePayroll } from "./engine/calculatePayroll.js";

const c = (d) => Math.round(d * 100);

describe("computeCcqBenefits", () => {
  it("computes the 13% indemnity on the base wage, excluding the premium", () => {
    // 40h at a $50.79 base rate (a $4.06 premium is NOT part of the indemnity base).
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.vacation).toBeCloseTo(40 * 50.79 * 0.13, 6); // 264.108
    expect(b.taxableBenefit).toBeCloseTo(40 * CCQ_ELECTRICIAN_IC_C3.taxableBenefitPerHour, 6);
  });

  it("computes the pension deduction from the wage (never a hardcoded per-hour amount)", () => {
    // Compagnon C3 2026: 50,79 × 1,13 × 9% = 5,165343 $/h → 40h = 206,61372.
    const j = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(j.pensionDeduction).toBeCloseTo(40 * 50.79 * 1.13 * 0.09, 6);
    expect(j.pensionDeduction / 40).toBeCloseTo(5.165343, 5);
    // Apprentices contribute at 4,5% on the same (wage + indemnity) base.
    const a1 = computeCcqBenefits({ hours: 40, hourlyWage: 25.40, employeePensionRate: 0.045 });
    expect(a1.pensionDeduction / 40).toBeCloseTo(25.40 * 1.13 * 0.045, 6); // 1,29159 $/h
  });

  it("computes MÉDIC + provincial tax as a net withholding, separate from the pension", () => {
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.medicWithholding).toBeCloseTo(40 * 0.68 * 1.09, 6); // 0,7412 $/h → 29,648
    // Take-home withholding = pension + MÉDIC; MÉDIC must NOT be in the tax deduction.
    expect(b.netWithholdings).toBeCloseTo(b.pensionDeduction + b.medicWithholding, 6);
  });

  it("maps benefits onto the right statutory bases (MÉDIC is not a tax deduction)", () => {
    const { vacation, taxableBenefit, pensionDeduction, baseAdjustments } = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(baseAdjustments.insurableEI).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.insurableRQAP).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.pensionable).toBeCloseTo(vacation + taxableBenefit, 6);
    // Only the pension (not MÉDIC) lowers Québec taxable income.
    expect(baseAdjustments.taxableQuebec).toBeCloseTo(vacation + taxableBenefit - pensionDeduction, 6);
    expect(baseAdjustments.taxableFederal).toBe(0);
  });
});

describe("engine baseAdjustments", () => {
  it("adds each adjustment to its base only, without changing cash paid", () => {
    const base = { taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" }, employee: {}, employer: { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02 }, earnings: [{ type: "regular", amount: 1000 }] };
    const plain = calculatePayroll(base);
    const adjusted = calculatePayroll({ ...base, baseAdjustments: { pensionable: 100, insurableEI: 50, insurableRQAP: 50, taxableQuebec: 80, taxableFederal: 0 } });
    expect(adjusted.gross.total).toBe(plain.gross.total);
    expect(adjusted.employee.rrq.total).toBeGreaterThan(plain.employee.rrq.total);
    expect(adjusted.employee.ei).toBeGreaterThan(plain.employee.ei);
    expect(adjusted.employee.rqap).toBeGreaterThan(plain.employee.rqap);
  });

  it("reproduces Simon Bellerive's D0033-0007 stub with sourced CCQ rates", () => {
    // 40h, compagnon C3 base 50,79 $ + prime chef d'équipe 4,06 $, YTD au 2026-08-29.
    const hours = 40, baseRate = 50.79, premium = 4.06;
    const wages = hours * (baseRate + premium);
    const ccq = computeCcqBenefits({ hours, hourlyWage: baseRate, employeePensionRate: 0.09 });
    const r = calculatePayroll({
      taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" },
      employee: { federalTaxProfile: {}, quebecTaxProfile: {} },
      employer: { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02 },
      earnings: [{ type: "regular", amount: wages }],
      baseAdjustments: ccq.baseAdjustments,
      ytd: {
        grossIncome: c(42210.99), rrqEmployee: c(2574.49), rrqEmployer: c(2574.49),
        eiEmployee: c(518.60), eiEmployer: c(518.60), rqapEmployee: c(171.52), rqapEmployer: c(171.52),
        federalTax: c(3743.97), quebecTax: c(5120.30),
        pensionableIncomeRRQ: c(42210.99), insurableIncomeEI: c(39891.29), insurableIncomeRQAP: c(39891.29),
      },
    });
    // RRQ / EI / RQAP reproduce to the cent with the sourced indemnity + benefit.
    expect(r.employee.rrq.total).toBeCloseTo(159.13, 2);
    expect(r.employee.ei).toBeCloseTo(31.96, 2);
    expect(r.employee.rqap).toBeCloseTo(10.57, 2);
    // With the CORRECT pension deduction (not the reverse-engineered 5,797), Québec
    // tax lands ~6 $ over the stub (352,25) — a residual base difference we do NOT
    // mask. Federal is within CRA table-rounding tolerance of 259,95.
    expect(r.employee.quebecTax).toBeCloseTo(358.31, 2);
    expect(Math.abs(r.employee.federalTax - 259.95)).toBeLessThan(1.5);
  });
});
