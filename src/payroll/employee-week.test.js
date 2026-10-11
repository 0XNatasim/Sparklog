import { describe, expect, it } from "vitest";
import { computeEmployeeWeekTalon } from "./employee-week.js";

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
