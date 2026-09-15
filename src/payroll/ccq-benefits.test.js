import { describe, it, expect } from "vitest";
import { computeCcqBenefits, computeUnionDues, CCQ_ELECTRICIAN_IC_C3 } from "./ccq-benefits.js";
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
    // Take-home withholding = pension + MÉDIC + union dues; none of MÉDIC is a tax deduction.
    expect(b.netWithholdings).toBeCloseTo(b.pensionDeduction + b.medicWithholding + b.unionDues, 6);
  });

  it("auto-computes the FTQ-FIPOE union dues (federal U1 deduction) by default", () => {
    // 55 % of one hour's wage per week + 0,05 $/h → 0,55 × 50,79 + 0,05 × 40 = 29,93.
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.unionDues).toBeCloseTo(0.55 * 50.79 + 0.05 * 40, 6);
    expect(b.unionDues).toBeCloseTo(29.93, 2);
    expect(b.federalDeduction).toBe(b.unionDues); // U1: federal only, Québec is a credit
  });

  it("maps benefits onto the right statutory bases (MÉDIC is not a tax deduction)", () => {
    const { vacation, taxableBenefit, pensionDeduction, baseAdjustments } = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(baseAdjustments.insurableEI).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.insurableRQAP).toBeCloseTo(vacation, 6);
    expect(baseAdjustments.pensionable).toBeCloseTo(vacation + taxableBenefit, 6);
    // Only the pension (not MÉDIC) lowers Québec taxable income.
    expect(baseAdjustments.taxableQuebec).toBeCloseTo(vacation + taxableBenefit - pensionDeduction, 6);
    // Federal source base EXCLUDES the MÉDIC taxable benefit (Québec taxes it; the CRA
    // does not withhold on it at source → T4A) = Québec base − avantage imposable.
    expect(baseAdjustments.taxableFederal).toBeCloseTo(baseAdjustments.taxableQuebec - taxableBenefit, 6);
    expect(baseAdjustments.taxableFederal).toBeCloseTo(vacation - pensionDeduction, 6);
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
    // Union dues (FTQ-FIPOE) are auto-computed (55 % × wage + 0,05 $/h = 29,93 $) and
    // applied as a federal-only deduction (T4127 U1), annualized; Québec = credit.
    expect(ccq.federalDeduction).toBeCloseTo(29.93, 2);
    const r = calculatePayroll({
      taxYear: 2026, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" },
      employee: { federalTaxProfile: { annualDeductions: ccq.federalDeduction * 52 }, quebecTaxProfile: {} },
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
    // Québec tax reproduces the stub to the cent once the RRQ enhancement ("première
    // cotisation supplémentaire", 1,0 %) is deducted from taxable income alongside
    // the CCQ pension contribution.
    expect(r.employee.quebecTax).toBeCloseTo(352.25, 2);
    // The Québec period taxable BASE composes to the stub's printed "gains imposables
    // provinciaux" (2 386,59 $) within rounding: salaire + vacances + avantage
    // imposable − retraite. This confirms the CCQ composition against primary data.
    const qcBase = wages + ccq.baseAdjustments.taxableQuebec;
    expect(qcBase).toBeCloseTo(2386.59, 1);

    // The federal source base EXCLUDES the MÉDIC taxable benefit (3,377 $/h, CCQ
    // Avantages imposables table) — a Québec-only taxable benefit not withheld
    // federally at source (T4A) — so the base = salaire + indemnité − retraite =
    // 2 251,49 $; then the U1 union dues (29,93 $) are deducted federally. Federal tax
    // computes 261,43 $ vs the stub's 259,95 $. The remaining ~1,50 $ is the
    // prélèvement CCQ (not a federal deduction) + TD1/rounding — documented, NOT
    // masked with a net-delta fudge. Québec tax is unaffected (union dues are a QC
    // credit, not a base deduction) and stays exact.
    const fedBase = wages + ccq.baseAdjustments.taxableFederal;
    expect(fedBase).toBeCloseTo(2251.49, 1);
    expect(r.employee.federalTax).toBeCloseTo(261.43, 2);
  });

  // A second, structural scenario (an apprentice at different hours) guards the base
  // COMPOSITION formulas so the model can't be silently overfit to one stub.
  it("composes the CCQ bases consistently for an apprentice (no stub-specific numbers)", () => {
    const hours = 32, wage = 30.47; // apprenti 2 C3
    const b = computeCcqBenefits({ hours, hourlyWage: wage, employeePensionRate: 0.045 });
    const vac = hours * wage * 0.13;
    const imp = hours * 3.377;
    const pension = hours * wage * 1.13 * 0.045;
    expect(b.baseAdjustments.insurableEI).toBeCloseTo(vac, 6);
    expect(b.baseAdjustments.pensionable).toBeCloseTo(vac + imp, 6);
    expect(b.baseAdjustments.taxableQuebec).toBeCloseTo(vac + imp - pension, 6);
    // Federal base = Québec base − MÉDIC taxable benefit (structural, same shape).
    expect(b.baseAdjustments.taxableFederal).toBeCloseTo(b.baseAdjustments.taxableQuebec - imp, 6);
  });

  // Rounding policy: the payroll rounds each component to the cent (and rounds the
  // pensionable hourly base BEFORE applying 9 %) when building the printed base. The
  // engine currently carries full precision, hence a 2¢ gap on the provincial base.
  // This test documents the difference so the policy is a conscious validation item.
  it("shows the payroll's per-component rounding reproduces the printed provincial base", () => {
    const round2 = (x) => Math.round(x * 100) / 100;
    const hours = 40, base = 50.79;
    const wages = 2194.0;
    const vac = round2(hours * base * 0.13);       // 264,11
    const imp = round2(hours * 3.377);             // 135,08

    // Payroll: round the pensionable hourly base (50,79 × 1,13 = 57,3927 → 57,39)
    // to the cent before × 9 % → 206,60. Engine: full precision → 206,6137 → 206,61.
    const pensionPayroll = round2(round2(base * 1.13) * 0.09 * hours);
    const pensionEngine = round2(hours * base * 1.13 * 0.09);
    expect(pensionPayroll).toBe(206.6);
    expect(pensionEngine).toBe(206.61);

    // Per-component-rounded (payroll) path reproduces the printed provincial base 2 386,59.
    expect(round2(wages + vac + imp - pensionPayroll)).toBe(2386.59);
    // Engine's full-precision pension lands 1¢ lower.
    expect(round2(wages + vac + imp - pensionEngine)).toBe(2386.58);
  });
});

describe("computeUnionDues (per union)", () => {
  const wage = 50.79, hours = 40;
  it("FTQ-FIPOE: 55 % + 0,05 $/h", () => {
    expect(computeUnionDues({ union: "ftq_fipoe", level: "journeyman", hourlyWage: wage, hours })).toBeCloseTo(0.55 * wage + 0.05 * hours, 6);
  });
  it("International (FIPOE 568): 65 % compagnon, 50 % apprenti, + 0,05 $/h", () => {
    expect(computeUnionDues({ union: "international_568", level: "journeyman", hourlyWage: wage, hours })).toBeCloseTo(0.65 * wage + 0.05 * hours, 6);
    expect(computeUnionDues({ union: "international_568", level: "apprentice1", hourlyWage: 25.40, hours })).toBeCloseTo(0.50 * 25.40 + 0.05 * hours, 6);
  });
  it("CSD: 50 % + 0,035 $/h", () => {
    expect(computeUnionDues({ union: "csd", level: "journeyman", hourlyWage: wage, hours })).toBeCloseTo(0.50 * wage + 0.035 * hours, 6);
  });
  it("CSN: 50 % compagnon; flat weekly apprentices", () => {
    expect(computeUnionDues({ union: "csn", level: "journeyman", hourlyWage: wage, hours })).toBeCloseTo(0.50 * wage, 6);
    expect(computeUnionDues({ union: "csn", level: "apprentice1", hourlyWage: 25.40, hours })).toBe(9.90);
  });
  it("SQC: flat weekly by level (independent of hours/rate)", () => {
    expect(computeUnionDues({ union: "sqc", level: "journeyman", hourlyWage: wage, hours })).toBe(15.25);
    expect(computeUnionDues({ union: "sqc", level: "apprentice2", hourlyWage: 30.47, hours: 12 })).toBe(10.75);
  });
  it("unknown union → 0 (no dues assumed)", () => {
    expect(computeUnionDues({ union: "nope", hourlyWage: wage, hours })).toBe(0);
  });
});
