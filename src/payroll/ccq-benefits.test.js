import { describe, it, expect } from "vitest";
import { computeCcqBenefits, CCQ_BENEFIT_RATES } from "./ccq-benefits.js";
import { calculatePayroll } from "./engine/calculatePayroll.js";

const c = (d) => Math.round(d * 100);

describe("computeCcqBenefits", () => {
  it("computes the 13% indemnity on the base wage, excluding the premium", () => {
    // 40h at a $50.79 base rate (a $4.06 premium is NOT part of the indemnity base).
    const b = computeCcqBenefits({ hours: 40, baseRate: 50.79 });
    expect(b.vacation).toBeCloseTo(40 * 50.79 * 0.13, 6); // 264.108
    expect(b.taxableBenefit).toBeCloseTo(40 * CCQ_BENEFIT_RATES.taxableBenefitPerHour, 6);
    expect(b.socialDeduction).toBeCloseTo(40 * CCQ_BENEFIT_RATES.socialBenefitsDeductionPerHour, 6);
  });

  it("maps benefits onto the right statutory bases", () => {
    const { vacation, taxableBenefit, socialDeduction, baseAdjustments } = computeCcqBenefits({ hours: 40, baseRate: 50.79 });
    // Indemnity is insurable (EI/RQAP) and pensionable; benefit adds to RRQ + QC tax;
    // deduction lowers QC taxable income; federal base is untouched.
    expect(baseAdjustments.insurableEI).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.insurableRQAP).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.pensionable).toBeCloseTo(vacation + taxableBenefit, 6);
    expect(baseAdjustments.taxableQuebec).toBeCloseTo(vacation + taxableBenefit - socialDeduction, 6);
    expect(baseAdjustments.taxableFederal).toBe(0);
  });

  it("accepts overridden per-métier rates", () => {
    const b = computeCcqBenefits({ hours: 10, baseRate: 40, rates: { vacationRateOfBaseWage: 0.1, taxableBenefitPerHour: 1, socialBenefitsDeductionPerHour: 2 } });
    expect(b.vacation).toBeCloseTo(40, 6); // 10 * 40 * 0.10
    expect(b.taxableBenefit).toBeCloseTo(10, 6);
    expect(b.socialDeduction).toBeCloseTo(20, 6);
  });
});

describe("engine baseAdjustments", () => {
  it("adds each adjustment to its base only, without changing cash paid", () => {
    const base = { taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" }, employee: {}, employer: { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02 }, earnings: [{ type: "regular", amount: 1000 }] };
    const plain = calculatePayroll(base);
    const adjusted = calculatePayroll({ ...base, baseAdjustments: { pensionable: 100, insurableEI: 50, insurableRQAP: 50, taxableQuebec: 80, taxableFederal: 0 } });
    // Cash paid (net + deductions on the cash) — gross cash total is unchanged.
    expect(adjusted.gross.total).toBe(plain.gross.total);
    // RRQ pensionable base grew by $100 → higher RRQ than the unadjusted run.
    expect(adjusted.employee.rrq.total).toBeGreaterThan(plain.employee.rrq.total);
    // EI/RQAP insurable grew by $50 each.
    expect(adjusted.employee.ei).toBeGreaterThan(plain.employee.ei);
    expect(adjusted.employee.rqap).toBeGreaterThan(plain.employee.rqap);
  });

  it("reproduces Simon Bellerive's D0033-0007 stub (RRQ/EI/RQAP/QC to the cent)", () => {
    const hours = 40, baseRate = 50.79, premium = 4.06;
    const wages = hours * (baseRate + premium);
    const ccq = computeCcqBenefits({ hours, baseRate });
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
    expect(r.employee.rrq.total).toBeCloseTo(159.13, 2);
    expect(r.employee.ei).toBeCloseTo(31.96, 2);
    expect(r.employee.rqap).toBeCloseTo(10.57, 2);
    expect(r.employee.quebecTax).toBeCloseTo(352.25, 2);
    // Federal is within CRA table rounding tolerance of the stub (259.95).
    expect(Math.abs(r.employee.federalTax - 259.95)).toBeLessThan(1.5);
  });
});
