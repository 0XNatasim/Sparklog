import { describe, expect, it } from "vitest";
import { costsByEmployee, openingLookup, taxYearsFor, weekEndOf, weeklyCosts } from "./employer-cost";
import { buildWeeklyReport } from "./weekly-report";
import { periodsFromWeeklyCosts } from "./period-costs";

// Coûts and Semaine / Mois add up the payroll's own weekly figures (V2.4.181).
const employer = { annualPayrollEstimate: 0, fssCategory: "general", cnesstRate: 0.0317, workforceSkillsFundApplicable: false };
const alice = { id: "a", full_name: "Alice", role: "employee", hourly_rate: 50.79, km_rate: 0.65, apprentice_level: "compagnon", union_association: "FTQ", phone_data_reimbursement: 7 };
const office = { id: "o", full_name: "Odile", role: "admin", hourly_rate: 30, km_rate: 0.5 };
const owner = { id: "k", full_name: "Karine", role: "owner", hourly_rate: 51 };
const job = (id, user_id, job_date, depart, fin, km, status = "approved") => ({ id, user_id, job_date, ot: "1234", depart, arrivee: depart, fin, km_total: km, status });
const jobs = [
  job("a1", "a", "2026-09-28", "07:00", "15:00", 40),
  job("a2", "a", "2026-09-29", "07:00", "17:00", 20),
  job("a3", "a", "2026-10-06", "07:00", "15:00", 10, "submitted"),
  job("draft", "a", "2026-10-07", "07:00", "15:00", 99, "saved"),
  job("o1", "o", "2026-09-29", "08:00", "16:00", 10),
];
const contributions = [
  { code: "rrq", label: "RRQ", rate_compagnon: 3.71 },
  { code: "benefits", label: "Avantages sociaux", rate_compagnon: 8.875 },
  { code: "ccq", label: "Cotisation CCQ", rate_compagnon: 0.43 },
];
const meals = [{ user_id: "a", job_date: "2026-09-29", amount: 30 }, { user_id: "o", job_date: "2026-09-29", amount: 30 }];
const parking = [{ user_id: "o", job_date: "2026-09-29", amount: 12 }];
const inputs = { start: "2026-09-27", end: "2026-10-10", profiles: [alice, office], jobs, meals, parking, contributions, employer };

describe("weeklyCosts", () => {
  const rows = weeklyCosts(inputs);

  it("gives one row per employee and CCQ week, without drafts", () => {
    expect(rows.map((r) => [r.userId, r.weekEnd])).toEqual([["a", "2026-10-03"], ["o", "2026-10-03"], ["a", "2026-10-10"]]);
    expect(rows[2].jobs.map((j) => j.id)).toEqual(["a3"]);
  });

  it("costs a CCQ week exactly like the printed weekly summary (the talon)", () => {
    const report = buildWeeklyReport({ week: { start: "2026-09-27", end: "2026-10-03" }, profiles: [alice], jobs, meals, contributions, employer });
    const pay = report.employees[0].pay;
    const a = rows[0];
    expect(a.labor).toBeCloseTo(pay.salary, 6);
    expect(a.conges).toBeCloseTo(pay.vacation, 6);
    expect(a.contribTotal).toBeCloseTo(pay.employer.statutoryTotal + pay.employer.ccqBenefits + pay.employer.otherCcqTotal, 6);
    expect(a.total).toBeCloseTo(pay.employer.total, 6);
    expect(a.contribLines.map((l) => l.code)).toEqual(expect.arrayContaining(["rrq", "cnesst", "benefits", "ccq"]));
    expect(a.minutes).toMatchObject({ worked: 18 * 60 });
  });

  it("costs office staff at their rate, without contributions, 13 % or supper", () => {
    const o = rows[1];
    expect(o.payroll).toBe(false);
    expect(o.labor).toBeCloseTo(30 * 8, 6);
    expect(o).toMatchObject({ conges: 0, contribTotal: 0, meals: 0, parking: 12 });
    expect(o.km).toBeCloseTo(5, 6);
    expect(o.total).toBeCloseTo(240 + 5 + 12, 6);
  });

  it("costs every week of fixed pay, even without jobs", () => {
    const taxProfiles = new Map([["k", { fixedWeeklyHours: 40, fixedPayStart: "2026-10-04", eiExempt: true }]]);
    const fixed = weeklyCosts({ ...inputs, profiles: [owner], jobs: [], taxProfiles });
    expect(fixed.map((r) => r.weekEnd)).toEqual(["2026-10-10"]);
    expect(fixed[0]).toMatchObject({ fixedPay: true, conges: 0 });
    expect(fixed[0].labor).toBeCloseTo(40 * 51, 6);
    expect(fixed[0].minutes.worked).toBe(40 * 60);
  });

  it("adds the weeks up per employee for Coûts", () => {
    const byEmployee = costsByEmployee(rows, [alice, office]);
    const a = byEmployee.find((e) => e.userId === "a");
    expect(a.weeks).toBe(2);
    expect(a.total).toBeCloseTo(rows[0].total + rows[2].total, 6);
    expect(a.contribLines.find((l) => l.code === "ccq").amount).toBeCloseTo(rows[0].contribLines.find((l) => l.code === "ccq").amount + rows[2].contribLines.find((l) => l.code === "ccq").amount, 6);
  });

  it("groups the weeks by CCQ week or monthly period for Semaine / Mois", () => {
    const t = (key) => key;
    const weeks = periodsFromWeeklyCosts(rows, "week", t);
    expect(weeks.map((w) => w.key)).toEqual(["2026-10-10", "2026-10-03"]);
    expect(weeks[1].activeEmployees).toBe(2);
    expect(weeks[1].total).toBeCloseTo(rows[0].total + rows[1].total, 6);
    const months = periodsFromWeeklyCosts(rows, "month", t);
    // September's period ends on its last Saturday (2026-09-26): both weeks are in October's.
    expect(months.map((m) => m.key)).toEqual(["2026-10-31"]);
    expect(months[0].total).toBeCloseTo(rows.reduce((s, r) => s + r.total, 0), 6);
  });
});

describe("opening YTD (same as the printed summary)", () => {
  it("takes the last comptabilisé week of the same tax year before the week, else the year's seed", () => {
    const openingFor = openingLookup({
      ledger: [
        { user_id: "a", tax_year: 2026, period_end: "2026-10-10", gross_income: 1000 },
        { user_id: "a", tax_year: 2026, period_end: "2026-10-17", gross_income: 2000 },
      ],
      seeds: [{ user_id: "a", tax_year: 2026, gross_income: 500 }, { user_id: "a", tax_year: 2027, gross_income: 0 }],
    });
    expect(openingFor("a", "2026-10-18").grossIncome).toBe(2000);
    expect(openingFor("a", "2026-10-11").grossIncome).toBe(1000);
    expect(openingFor("a", "2026-10-04").grossIncome).toBe(500);
    // The week ending 2026-12-26 is paid on 2026-12-31; the next one in 2027.
    expect(openingFor("a", "2026-12-27").grossIncome).toBe(0);
    expect(openingFor("b", "2026-10-18").grossIncome).toBe(0);
  });

  it("knows the tax years a range needs and the Saturday ending a week", () => {
    expect(taxYearsFor("2026-01-01", "2026-12-31")).toEqual([2026, 2027]);
    expect(taxYearsFor("2026-10-01", "2026-10-25")).toEqual([2026]);
    expect(weekEndOf("2026-10-25")).toBe("2026-10-31");
    expect(weekEndOf("2026-10-31")).toBe("2026-10-31");
  });
});
