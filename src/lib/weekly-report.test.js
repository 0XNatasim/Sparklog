import { describe, expect, it } from "vitest";
import { buildWeeklyReport, buildWeeklyReportHtml } from "./weekly-report.js";
import { computeEmployeeWeekTalon } from "@/payroll/employee-week";

// CCQ week 2026-09-27 (Sunday) → 2026-10-03 (Saturday).
const week = { start: "2026-09-27", end: "2026-10-03", weekNo: 40 };
const employer = { annualPayrollEstimate: 0, fssCategory: "general", cnesstRate: 0.0317, workforceSkillsFundApplicable: false };
const alice = { id: "a", full_name: "Alice <Test>", role: "employee", hourly_rate: 50.79, km_rate: 0.65, apprentice_level: "compagnon", union_association: "FTQ", employee_number: "12" };
const bruno = { id: "b", full_name: "Bruno", role: "employee", hourly_rate: 40, km_rate: 0.65, apprentice_level: "apprenti_2", union_association: "FTQ" };
const office = { id: "o", full_name: "Odile", role: "admin", hourly_rate: 30 };
const job = (id, user_id, job_date, ot, depart, fin, km, status = "approved", extra = {}) => ({ id, user_id, job_date, ot, depart, arrivee: depart, fin, km_total: km, status, ...extra });

const jobs = [
  job("a1", "a", "2026-09-28", "1234", "07:00", "15:00", 40),
  job("a2", "a", "2026-09-29", "1234", "07:00", "17:00", 20), // 10 h → 2 h overtime
  job("a3", "a", "2026-09-30", "JOB-9", "07:00", "15:00", 10, "submitted"),
  job("b1", "b", "2026-09-28", "1234", "07:00", "11:00", 15),
  job("b2", "b", "2026-09-28", "", "12:00", "16:00", 5),
  job("o1", "o", "2026-09-29", "AD-1", "08:00", "16:00", 0),
  job("draft", "a", "2026-10-01", "1234", "07:00", "15:00", 99, "saved"),
  job("other-week", "a", "2026-10-05", "1234", "07:00", "15:00", 99),
];
const contributions = [
  { code: "rrq", label: "RRQ", rate_compagnon: 3.71, rate_apprenti_2: 2.63 },
  { code: "benefits", label: "Avantages sociaux", rate_compagnon: 8.875, rate_apprenti_2: 7.955 },
  { code: "ccq", label: "Cotisation CCQ", rate_compagnon: 0.43, rate_apprenti_2: 0.3 },
];

const report = buildWeeklyReport({
  week, profiles: [office, bruno, alice], jobs, contributions, employer,
  meals: [{ user_id: "a", job_date: "2026-09-29", amount: 30 }, { user_id: "o", job_date: "2026-09-29", amount: 30 }],
  parking: [{ user_id: "b", job_date: "2026-09-28", amount: 12 }],
});
const byId = new Map(report.employees.map((e) => [e.id, e]));

describe("buildWeeklyReport", () => {
  it("lists only the week's submitted/updated/approved jobs, employees sorted by name", () => {
    expect(report.employees.map((e) => e.id)).toEqual(["a", "b", "o"]);
    expect(byId.get("a").jobs.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(byId.get("a").pendingJobs).toBe(1);
    expect(report.totals.pendingJobs).toBe(1);
  });

  it("gives every job its OT number, paid time and km, and sums the week", () => {
    const a = byId.get("a");
    expect(a.jobs[1]).toMatchObject({ ot: "1234", paidMinutes: 600, km: 20 });
    expect(a.hours.paidMinutes).toBe(8 * 60 + 10 * 60 + 8 * 60);
    expect(a.hours.ot50Minutes + a.hours.ot100Minutes).toBe(120);
    expect(a.hours.km).toBe(70);
  });

  it("uses the Talon/DAS calculation for pay and DAS", () => {
    const a = byId.get("a");
    const talon = computeEmployeeWeekTalon({
      profile: alice, jobs: jobs.filter((j) => ["a1", "a2", "a3"].includes(j.id)), frequency: "weekly",
      includePhone: true, includeStorage: true, weekDate: week.start, employer,
    });
    expect(a.pay.das.total).toBeCloseTo(talon.result.das.total, 6);
    expect(a.pay.salary).toBeCloseTo(talon.result.gross.total, 6);
    expect(a.pay.employer.statutory.cnesst).toBeCloseTo(talon.result.employer.cnesst, 6);
    expect(a.pay.employer.statutory.cnesst).toBeGreaterThan(0);
  });

  it("adds only the CCQ per-hour contributions the engine does not compute", () => {
    const a = byId.get("a");
    expect(a.pay.employer.otherCcq.map((c) => c.code)).toEqual(["ccq"]);
    expect(a.pay.employer.otherCcq[0].amount).toBeCloseTo(0.43 * 26, 2);
    const p = a.pay;
    const expected = p.salary + p.vacation + p.employer.statutoryTotal + p.employer.ccqBenefits + p.employer.otherCcqTotal + p.reimbursementTotal;
    expect(p.employer.total).toBeCloseTo(expected, 6);
    expect(p.reimbursements.meals).toBe(30);
  });

  it("keeps non-CCQ roles out of pay and DAS, like the DAS screen", () => {
    const o = byId.get("o");
    expect(o.pay).toBeNull();
    expect(o.meals).toBe(0);
    expect(o.category).toBe("nonCcq");
    const ccq = report.employees.filter((e) => e.pay);
    expect(report.totals.dasTotal).toBeCloseTo(ccq.reduce((s, e) => s + e.pay.das.total, 0), 6);
    expect(report.totals.employerCost).toBeCloseTo(ccq.reduce((s, e) => s + e.pay.employer.total, 0), 6);
  });
});

describe("buildWeeklyReportHtml", () => {
  const html = buildWeeklyReportHtml(report, { generatedAt: new Date("2026-10-13T12:00:00") });

  it("escapes names and prints the jobs, DAS and employer cost, without a per-OT recap", () => {
    expect(html).toContain("Alice &lt;Test&gt;");
    expect(html).not.toContain("Alice <Test>");
    expect(html).not.toContain("Sommaire par n° OT");
    expect(html).toContain("JOB-9");
    expect(html).toContain("DAS à remettre");
    expect(html).toContain("Coût employeur");
    expect(html).toContain("1 job(s) non approuvée(s)");
  });

  it("never prints NAS or addresses", () => {
    expect(html).not.toMatch(/NAS|adresse/i);
  });
});
