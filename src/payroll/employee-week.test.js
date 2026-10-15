import { describe, expect, it } from "vitest";
import { computeEmployeeWeekTalon } from "./employee-week.js";
import { buildClosing, payTotals } from "@/lib/payroll-closing";
import { buildStubModel } from "@/lib/paystub";

const profile = { hourly_rate: 50.79, km_rate: 0.65, phone_data_reimbursement: 7, apprentice_level: "compagnon", union_association: "FTQ" };
const jobs = [{ id: "j1", user_id: "u1", job_date: "2026-09-28", depart: "07:00", arrivee: "07:00", fin: "15:00", km_total: 10, status: "approved" }];

describe("computeEmployeeWeekTalon phone reimbursement", () => {
  it("adds the employee's weekly phone-data amount when included", () => {
    const talon = computeEmployeeWeekTalon({ profile, jobs, includePhone: true, weekDate: "2026-09-27" });
    expect(talon.reimb.phone).toBe(7);
    expect(talon.reimb.total).toBeCloseTo(talon.reimb.km + 7 + talon.reimb.safety, 6);
  });

  it("uses the per-employee amount, and none when it is zero", () => {
    expect(computeEmployeeWeekTalon({ profile: { ...profile, phone_data_reimbursement: 12.5 }, jobs, includePhone: true, weekDate: "2026-09-27" }).reimb.phone).toBe(12.5);
    expect(computeEmployeeWeekTalon({ profile: { ...profile, phone_data_reimbursement: 0 }, jobs, includePhone: true, weekDate: "2026-09-27" }).reimb.phone).toBe(0);
  });
});

describe("computeEmployeeWeekTalon storage allowance", () => {
  const stored = { ...profile, storage_compensation: true, storage_compensation_amount: 60 };
  const week = (p) => computeEmployeeWeekTalon({ profile: p, jobs, includePhone: true, includeStorage: true, weekDate: "2026-09-27" });

  it("pays the employee's storage amount only when checked", () => {
    expect(week(stored).reimb.storage).toBe(60);
    expect(week({ ...stored, storage_compensation: false }).reimb.storage).toBe(0);
  });

  it("adds storage to the amount paid, the stub and « Autre revenu », not to taxable pay", () => {
    const withStorage = week(stored);
    const without = week({ ...stored, storage_compensation: false });
    expect(withStorage.result.employee.quebecTax).toBe(without.result.employee.quebecTax);
    const paid = (talon) => payTotals(talon.result, talon.ccqAmounts, talon.reimb).netPlusReimb;
    expect(paid(withStorage) - paid(without)).toBeCloseTo(60, 6);
    const model = buildStubModel({ result: withStorage.result, ytd: {}, pay: withStorage.pay, reimb: withStorage.reimb, ccq: withStorage.ccqAmounts });
    expect(model.storageReimb).toBe(60);
    expect(model.gains.some((g) => g.label === "Entreposage" && g.montant === 60)).toBe(true);
    const closing = buildClosing({ opening: {}, result: withStorage.result, ccq: withStorage.ccqAmounts, reimb: withStorage.reimb, pay: withStorage.pay });
    expect(closing.otherIncome).toBe(67);
  });
});

describe("computeEmployeeWeekTalon premiums (owner decisions 2026-10-13)", () => {
  const week = (p, extra = {}) => computeEmployeeWeekTalon({ profile: p, jobs, weekDate: "2026-09-27", ...extra });

  it("the non-CCQ premium stays outside the 13 % and the prélèvement", () => {
    const base = week(profile);
    const withPremium = week({ ...profile, team_leader_premium: 4.06 });
    expect(withPremium.ccqAmounts.vacation).toBe(base.ccqAmounts.vacation);
    expect(withPremium.ccqAmounts.prelevementCcq).toBe(base.ccqAmounts.prelevementCcq);
    expect(withPremium.result.gross.total - base.result.gross.total).toBeCloseTo(8 * 4.06, 2);
  });

  it("the CCQ team-leader premium enters the 13 % and the prélèvement", () => {
    const base = week(profile);
    const ccq = week({ ...profile, team_leader_premium_ccq: 4.06 }); // 8 h × 4,06 = 32,48
    expect(ccq.pay.ccqPremium).toBe(4.06);
    expect(ccq.ccqAmounts.vacation).toBeCloseTo(Math.round((8 * 50.79 + 32.48) * 0.13 * 100) / 100, 2);
    expect(ccq.ccqAmounts.prelevementCcq).toBeGreaterThan(base.ccqAmounts.prelevementCcq);
    expect(ccq.result.gross.total - base.result.gross.total).toBeCloseTo(32.48, 2);
  });
});

describe("computeEmployeeWeekTalon employer settings and tax forms", () => {
  it("uses the TD1 / TP-1015.3 amounts and extra tax from Paramètres", () => {
    const basic = computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27" });
    const higherCredits = computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27", taxProfile: { td1ClaimAmount: 30000, personalTaxCredits: 30000 } });
    expect(higherCredits.result.employee.federalTax).toBeLessThan(basic.result.employee.federalTax);
    expect(higherCredits.result.employee.quebecTax).toBeLessThan(basic.result.employee.quebecTax);
    const extra = computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27", taxProfile: { federalAdditionalTax: 25, quebecAdditionalTax: 10 } });
    expect(extra.result.employee.federalTax - basic.result.employee.federalTax).toBeCloseTo(25, 2);
    expect(extra.result.employee.quebecTax - basic.result.employee.quebecTax).toBeCloseTo(10, 2);
  });

  it("without a CNESST rate the result requires review instead of guessing one", () => {
    const talon = computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27" });
    expect(talon.result.requiresReview).toBe(true);
  });
});

// Stub D0038-0002 (Karine Messier, Présidente, week of 2026-10-04 → 2026-10-10): fixed pay
// « Régulier à taux horaire 40,00 × 51,0000 », no AE (owner > 40 % of the shares), no CCQ lines.
describe("fixed weekly pay (owner stub D0038-0002)", () => {
  const owner = { id: "k", full_name: "Karine Messier", role: "owner", hourly_rate: 51 };
  const taxProfile = { fixedWeeklyHours: 40, fixedPayStart: "2026-01-04", eiExempt: true };
  // Opening = cumulative − period, as printed on the stub.
  const opening = {
    grossIncome: 55080, regularEarnings: 55080, hoursYtd: 1080, vacationPay: 2203.2,
    federalTax: 6342.57, quebecTax: 7432.56, rrqEmployee: 3355.56, rqapEmployee: 236.79,
    pensionableIncomeRRQ: 55080, insurableIncomeRQAP: 55080, labourStandardsIncome: 55080,
  };
  const employer = { annualPayrollEstimate: 0, fssCategory: "general", cnesstRate: 0.0317, workforceSkillsFundApplicable: false };
  const talon = computeEmployeeWeekTalon({ profile: owner, jobs: [], opening, weekDate: "2026-10-04", taxProfile, employer, includePhone: true, includeStorage: true });

  it("pays the fixed hours with no job, and every deduction to the cent", () => {
    expect(talon.fixedPay).toBe(true);
    expect(talon.ccqAmounts).toBeNull();
    expect(talon.result.gross.total).toBe(2040);
    const e = talon.result.employee;
    expect(e.federalTax).toBe(234.91);
    expect(e.quebecTax).toBe(275.28);
    expect(e.rrq.total).toBe(124.28);
    expect(e.ei).toBe(0);
    expect(e.rqap).toBe(8.77);
    expect(e.totalDeductions).toBe(643.24);
    expect(payTotals(talon.result, talon.ccqAmounts, talon.reimb).netPlusReimb).toBeCloseTo(1396.76, 2);
    expect(talon.result.employer.ei).toBe(0);
  });

  it("advances the stub's cumulatives (Salaire régulier, Heures, Vacances, RRQ, RQAP)", () => {
    const closing = buildClosing({ opening, result: talon.result, ccq: talon.ccqAmounts, reimb: talon.reimb, pay: talon.pay });
    expect(closing).toMatchObject({
      grossIncome: 57120, regularEarnings: 57120, hoursYtd: 1120, vacationPay: 2284.8,
      federalTax: 6577.48, quebecTax: 7707.84, rrqEmployee: 3479.84, rqapEmployee: 245.56, vacancesCcq: 0,
    });
  });

  it("ignores the hours of any job entered that week but still reimburses its km", () => {
    const withJob = computeEmployeeWeekTalon({ profile: { ...owner, km_rate: 0.65 }, jobs: [{ ...jobs[0], job_date: "2026-10-05" }], opening, weekDate: "2026-10-04", taxProfile, employer });
    expect(withJob.result.gross.total).toBe(2040);
    expect(withJob.reimb.km).toBeCloseTo(6.5, 6);
  });

  it("EI exemption alone: a job-paid employee pays no EI premium", () => {
    const paid = computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27", taxProfile: { eiExempt: true } });
    expect(paid.result.employee.ei).toBe(0);
    expect(paid.result.employer.ei).toBe(0);
    expect(computeEmployeeWeekTalon({ profile, jobs, weekDate: "2026-09-27" }).result.employee.ei).toBeGreaterThan(0);
  });
});

describe("fixed weekly pay — printed stub", () => {
  const owner = { id: "k", full_name: "Karine Messier", role: "owner", hourly_rate: 51, employee_number: "01" };
  const taxProfile = { fixedWeeklyHours: 40, fixedPayStart: "2026-01-04", eiExempt: true };
  const opening = { grossIncome: 55080, regularEarnings: 55080, hoursYtd: 1080, vacationPay: 2203.2, federalTax: 6342.57, quebecTax: 7432.56, rrqEmployee: 3355.56, rqapEmployee: 236.79, pensionableIncomeRRQ: 55080, insurableIncomeRQAP: 55080, labourStandardsIncome: 55080 };
  const talon = computeEmployeeWeekTalon({ profile: owner, jobs: [], opening, weekDate: "2026-10-04", taxProfile });

  it("aperçu: one « Régulier à taux horaire » line, Vacances 81,60, no CCQ or AE line", () => {
    const model = buildStubModel({ result: talon.result, ytd: opening, pay: talon.pay, reimb: talon.reimb, ccq: talon.ccqAmounts });
    expect(model.gains.map((g) => [g.label, g.unit, g.montant])).toEqual([["Régulier à taux horaire (taux de base)", 40, 2040]]);
    const byLabel = Object.fromEntries(model.sommaire.map((l) => [l.label, l]));
    expect(byLabel.Vacances.per).toBeCloseTo(81.6, 2);
    expect(byLabel.Vacances.cum).toBeCloseTo(2284.8, 2);
    expect(byLabel["Heures travaillées"]).toMatchObject({ per: 40, cum: 1120 });
    expect(Object.keys(byLabel).some((l) => /CCQ|MÉDIC|syndical|AE/.test(l))).toBe(false);
    expect(model.netPlusReimb).toBeCloseTo(1396.76, 2);
  });
});
