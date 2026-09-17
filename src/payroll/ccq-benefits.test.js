import { describe, it, expect } from "vitest";
import { computeCcqBenefits, computeUnionDues, computeCcqLevies, CCQ_ELECTRICIAN_IC_C3 } from "./ccq-benefits.js";
import { calculatePayroll } from "./engine/calculatePayroll.js";

const c = (d) => Math.round(d * 100);

describe("computeCcqBenefits", () => {
  it("computes the 13% indemnity on the base wage, excluding the premium", () => {
    // 40h at a $50.79 base rate (a $4.06 premium is NOT part of the indemnity base).
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    // Rounded to the cent, as the employer prints each line: 40 × 50,79 × 13 % = 264,11.
    expect(b.vacation).toBe(264.11);
    expect(b.taxableBenefit).toBe(135.08); // 40 × 3,377
  });

  it("computes the pension deduction from the wage (never a hardcoded per-hour amount)", () => {
    // Compagnon C3 2026: pensionable hourly base 50,79 × 1,13 = 57,3927 → rounded 57,39,
    // then × 9 % × 40 h = 206,60 $ (matches the stub's printed retraite line).
    const j = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(j.pensionDeduction).toBe(206.6);
    // Apprentices contribute at 4,5% on the same (wage + indemnity) base: 25,40 × 1,13
    // = 28,702 → 28,70, then × 4,5 % × 40 h = 51,66 $.
    const a1 = computeCcqBenefits({ hours: 40, hourlyWage: 25.40, employeePensionRate: 0.045 });
    expect(a1.pensionDeduction).toBe(51.66);
  });

  it("computes MÉDIC + provincial tax as a net withholding, separate from the pension", () => {
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.medicWithholding).toBeCloseTo(40 * 0.68 * 1.09, 6); // 0,7412 $/h → 29,648
    // Take-home withholding = pension + MÉDIC + union dues; none of MÉDIC is a tax deduction.
    expect(b.netWithholdings).toBeCloseTo(b.pensionDeduction + b.medicWithholding + b.unionDues, 6);
  });

  it("pays the safety-equipment allowance on safetyEquipmentHours (return time included)", () => {
    // Base benefit hours 35.18h, plus 2.75h of carved-out return time still gets the
    // équipement de sécurité (indemnity, not a social benefit).
    const withReturn = computeCcqBenefits({ hours: 35.18, hourlyWage: 50.79, employeePensionRate: 0.09, safetyEquipmentHours: 35.18 + 2.75 });
    const baseOnly = computeCcqBenefits({ hours: 35.18, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(withReturn.safetyEquipment).toBeCloseTo((35.18 + 2.75) * 0.80, 6);
    // Pension/MÉDIC still key off the base hours only (avantages sociaux excluded on return).
    expect(withReturn.pensionDeduction).toBe(baseOnly.pensionDeduction);
    expect(withReturn.medicWithholding).toBe(baseOnly.medicWithholding);
  });

  it("auto-computes the FTQ-FIPOE union dues (federal U1 deduction) by default", () => {
    // 55 % of one hour's wage per week + 0,05 $/h → 0,55 × 50,79 + 0,05 × 40 = 29,93.
    const b = computeCcqBenefits({ hours: 40, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.unionDues).toBeCloseTo(0.55 * 50.79 + 0.05 * 40, 6);
    expect(b.unionDues).toBeCloseTo(29.93, 2);
    expect(b.federalDeduction).toBe(b.unionDues); // U1: federal only, Québec is a credit
  });

  it("assembles the complete stub gross-up and net (D0033-0007)", () => {
    const hours = 40, base = 50.79, prem = 4.06;
    const wages = hours * (base + prem); // 2194.00 cash earnings (salaire + prime)
    const b = computeCcqBenefits({ hours, hourlyWage: base, employeePensionRate: 0.09, union: "ftq_fipoe", level: "journeyman", prelevementCcq: 17.22, caisseEducationSyndicale: 0.80 });
    // Gross-up = cash + vacation + MÉDIC benefit + employer social benefit + safety equip.
    const grossUp = wages + b.vacation + b.taxableBenefit + b.employerSocialBenefit + b.safetyEquipment;
    expect(grossUp).toBeCloseTo(2980.19, 1); // matches the stub's printed "Gains"
    expect(b.safetyEquipment).toBeCloseTo(32.00, 2); // 0,80 $/h × 40
    expect(b.employerSocialBenefit).toBeCloseTo(355.00, 2); // 8,875 $/h × 40
    // Net = cash + safety allowance − statutory − CCQ withholdings. Uses the stub's
    // table-rounded federal (259,95, option B) for the statutory total.
    const statutory = 259.95 + 352.25 + 159.13 + 31.96 + 10.57;
    const net = wages + b.safetyEquipment - statutory - b.netWithholdings;
    expect(net).toBeCloseTo(1127.94, 1); // matches the stub's printed "Paie nette"
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
    // The federal U1 deduction is the full set of union/professional withholdings the
    // employer treats as source-deductible: cotisation syndicale (FTQ-FIPOE, auto-
    // computed 55 % × wage + 0,05 $/h = 29,93 $) + prélèvement CCQ (17,22 $) + caisse
    // d'éducation syndicale (0,80 $) = 47,95 $/semaine (stub D0033-0007 retenues).
    const ccq = computeCcqBenefits({
      hours, hourlyWage: baseRate, employeePensionRate: 0.09,
      union: "ftq_fipoe", level: "journeyman", prelevementCcq: 17.22, caisseEducationSyndicale: 0.80,
    });
    expect(ccq.federalDeduction).toBeCloseTo(47.95, 2);
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
    // federally at source (T4A) — so the pre-deduction base = salaire + indemnité −
    // retraite = 2 251,49 $; then the U1 deductions (union 29,93 + prélèvement 17,22 +
    // caisse 0,80 = 47,95 $) and the RRQ 1re cotisation supplémentaire (25,26 $) are
    // deducted, giving the period taxable 2 178,30 $ — the value PDOC (CRA) reports.
    const fedBase = wages + ccq.baseAdjustments.taxableFederal;
    expect(fedBase).toBeCloseTo(2251.49, 1);
    // Federal tax now reproduces the stub AND PDOC to the cent (259,95 $). Two sourced
    // corrections land it exactly, with NO net-delta fudge:
    //   1. the K2 QPP credit is capped at the base-plan maximum (5,30 % × 71 100 =
    //      3 768,30 $), not the base+enhancement maximum — CRA T4127 factor K2; and
    //   2. the full CCQ U1 deduction set (union + prélèvement + caisse) is deducted
    //      federally, matching the taxable base PDOC computes (2 178,30 $).
    expect(r.employee.federalTax).toBeCloseTo(259.95, 2);
  });

  // A second, structural scenario (an apprentice at different hours) guards the base
  // COMPOSITION formulas so the model can't be silently overfit to one stub.
  it("composes the CCQ bases consistently for an apprentice (no stub-specific numbers)", () => {
    const hours = 32, wage = 30.47; // apprenti 2 C3
    const b = computeCcqBenefits({ hours, hourlyWage: wage, employeePensionRate: 0.045 });
    const round2 = (x) => Math.round(x * 100) / 100; // components are rounded to the cent
    const vac = round2(hours * wage * 0.13);
    const imp = round2(hours * 3.377);
    const pension = round2(round2(wage * 1.13) * 0.045 * hours);
    expect(b.baseAdjustments.insurableEI).toBeCloseTo(vac, 6);
    expect(b.baseAdjustments.pensionable).toBeCloseTo(vac + imp, 6);
    expect(b.baseAdjustments.taxableQuebec).toBeCloseTo(vac + imp - pension, 6);
    // Federal base = Québec base − MÉDIC taxable benefit (structural, same shape).
    expect(b.baseAdjustments.taxableFederal).toBeCloseTo(b.baseAdjustments.taxableQuebec - imp, 6);
  });

  // Rounding policy: the CCQ layer rounds each component to the cent, and rounds the
  // pensionable hourly base to the cent BEFORE applying the pension rate, matching how
  // the employer's payroll prints each line. This reproduces the stub's printed base
  // exactly (2 386,59 $) rather than landing 1¢ low from full-precision arithmetic.
  it("rounds each CCQ component to the cent, reproducing the printed provincial base", () => {
    const round2 = (x) => Math.round(x * 100) / 100;
    const hours = 40, base = 50.79;
    const wages = 2194.0;
    const b = computeCcqBenefits({ hours, hourlyWage: base, employeePensionRate: 0.09 });

    expect(b.vacation).toBe(264.11);       // 40 × 50,79 × 13 %
    expect(b.taxableBenefit).toBe(135.08); // 40 × 3,377
    // Pensionable hourly base 50,79 × 1,13 = 57,3927 → 57,39, then × 9 % × 40 h = 206,60
    // (NOT the full-precision 206,61 that would shift the printed base 1¢).
    expect(b.pensionDeduction).toBe(206.6);

    // The per-component-rounded base reproduces the printed provincial base 2 386,59 $.
    const qcBase = wages + b.baseAdjustments.taxableQuebec;
    expect(round2(qcBase)).toBe(2386.59);
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

describe("computeCcqLevies (prélèvement + caisse d'éducation)", () => {
  it("reproduces the D0033-0007 levies: prélèvement 17,22 $ + caisse 0,80 $", () => {
    const l = computeCcqLevies({ hours: 40, hourlyWage: 50.79, vacationHolidaySickRate: 0.13, union: "ftq_fipoe" });
    // 0,75 % × (40 × 50,79 + 264,11 vacances) = 0,0075 × 2 295,71 = 17,22
    expect(l.prelevementCcq).toBe(17.22);
    // FTQ-FIPOE caisse 0,02 $/h × 40 = 0,80
    expect(l.caisseEducationSyndicale).toBe(0.80);
  });
  it("caisse d'éducation is 0 for a union without a sourced rate", () => {
    const l = computeCcqLevies({ hours: 40, hourlyWage: 50.79, union: "csd" });
    expect(l.caisseEducationSyndicale).toBe(0);
    expect(l.prelevementCcq).toBeGreaterThan(0); // prélèvement applies to all
  });
});

describe("13% indemnity base includes overtime at its multiplier (talon method)", () => {
  // D0034-0008 (week 38): 31 h régulier + 2 h temps double, base 50,79.
  // Vacationable wage = (31 + 2×2) × 50,79 = 35 × 50,79 = 1 777,65 → 13 % = 231,09.
  it("vacation on 31h + 2h double = 231,09 (not the straight 33h × base)", () => {
    const b = computeCcqBenefits({ hours: 33, hourlyWage: 50.79, employeePensionRate: 0.09, overtime200Hours: 2 });
    expect(b.vacation).toBe(231.09);
    // Pension stays on total worked hours at the base rate (OT at straight): 57,39 × 9 % × 33.
    expect(b.pensionDeduction).toBe(170.45);
  });
  it("prélèvement follows the same OT-weighted base: 15,07", () => {
    const l = computeCcqLevies({ hours: 33, hourlyWage: 50.79, overtime200Hours: 2, union: "ftq_fipoe" });
    // 0,75 % × (1 777,65 + 231,09) = 0,0075 × 2 008,74 = 15,07
    expect(l.prelevementCcq).toBe(15.07);
  });
  it("temps et demi (1,5×) is weighted too", () => {
    // 30 h régulier + 2 h temps et demi = (30 + 2×1,5) × 50,79 = 33 × 50,79 = 1 676,07 → 217,89.
    const b = computeCcqBenefits({ hours: 32, hourlyWage: 50.79, employeePensionRate: 0.09, overtime150Hours: 2 });
    expect(b.vacation).toBe(217.89);
  });
  it("no overtime → unchanged (33 h × base × 13 %)", () => {
    const b = computeCcqBenefits({ hours: 33, hourlyWage: 50.79, employeePensionRate: 0.09 });
    expect(b.vacation).toBe(217.89);
  });
});
