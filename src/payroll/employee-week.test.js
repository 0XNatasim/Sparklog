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
