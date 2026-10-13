import { describe, expect, it } from "vitest";
import { engineYtdFromOpening } from "./ytd.js";
import { computeEmployeeWeekTalon } from "./employee-week.js";

const profile = { hourly_rate: 50.79, km_rate: 0.65, apprentice_level: "compagnon", union_association: "FTQ" };
const jobs = [{ id: "j1", user_id: "u1", job_date: "2026-09-28", depart: "07:00", arrivee: "07:00", fin: "15:00", km_total: 0, status: "approved" }];

describe("engineYtdFromOpening — employer share of the year-to-date", () => {
  it("derives the employer AE and RQAP from the employee amounts, not a copy of them", () => {
    const ytd = engineYtdFromOpening({ eiEmployee: 500, rqapEmployee: 200, rrqEmployee: 3000, rrq2Employee: 100 });
    expect(ytd.eiEmployee).toBe(50000);
    expect(ytd.eiEmployer).toBe(70000); // AE employer = 1,4 × employee
    expect(ytd.rqapEmployer).toBe(Math.round(20000 * 0.00602 / 0.0043)); // 280,00 $
    expect(ytd.rrqEmployer).toBe(300000); // RRQ: equal shares
    expect(ytd.rrq2Employer).toBe(10000);
  });

  it("an employee at the annual maximum puts the employer exactly at its own maximum", () => {
    const ytd = engineYtdFromOpening({ eiEmployee: 895.70, rqapEmployee: 442.90 });
    expect(ytd.eiEmployer).toBe(125398);
    expect(ytd.rqapEmployer).toBe(62006);
  });

  it("an empty opening is all zeros", () => {
    const ytd = engineYtdFromOpening({});
    expect(Object.values(ytd).every((v) => v === 0)).toBe(true);
  });
});

describe("annual maximums stop the deductions (talon)", () => {
  it("no employer AE or RQAP once the employee reached the maximum", () => {
    const opening = { eiEmployee: 895.70, rqapEmployee: 442.90, insurableIncomeEI: 68900, insurableIncomeRQAP: 103000 };
    const talon = computeEmployeeWeekTalon({ profile, jobs, opening, weekDate: "2026-09-27" });
    expect(talon.result.employee.ei).toBe(0);
    expect(talon.result.employee.rqap).toBe(0);
    expect(talon.result.employer.ei).toBe(0);
    expect(talon.result.employer.rqap).toBe(0);
  });

  it("no RRQ (either tier) once the employee reached both maximums", () => {
    const opening = { rrqEmployee: 4479.30, rrq2Employee: 416, pensionableIncomeRRQ: 85000 };
    const talon = computeEmployeeWeekTalon({ profile, jobs, opening, weekDate: "2026-09-27" });
    expect(talon.result.employee.rrq.total).toBe(0);
    expect(talon.result.employer.rrq).toBe(0);
  });
});
