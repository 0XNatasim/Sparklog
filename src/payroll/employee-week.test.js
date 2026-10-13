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
