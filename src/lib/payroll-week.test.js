import { describe, expect, it } from "vitest";
import { lastCompletedWeekEnd, ledgerRowFor, planPayrollWeek, postPayrollWeek, weekBounds, weekEndOf } from "./payroll-week";
import { computeEmployeeWeekTalon } from "@/payroll/employee-week";

const compagnon = (id, full_name) => ({ id, full_name, role: "employee", hourly_rate: 50.79, km_rate: 0.65, apprentice_level: "compagnon", union_association: "FTQ" });
const job = (id, user_id, job_date, status = "approved") => ({ id, user_id, job_date, status, depart: "07:00", arrivee: "07:00", fin: "15:00", km_total: 20 });
const compute = (profile, jobs, opening) => computeEmployeeWeekTalon({ profile, jobs, opening, frequency: "weekly", weekDate: jobs[0].job_date });

describe("week helpers", () => {
  it("finds the CCQ week (Sunday → Saturday) and the last week that is over", () => {
    expect(weekEndOf("2026-10-14")).toBe("2026-10-17");
    expect(weekEndOf("2026-10-17")).toBe("2026-10-17");
    expect(lastCompletedWeekEnd("2026-10-14")).toBe("2026-10-10");
    expect(lastCompletedWeekEnd("2026-10-17")).toBe("2026-10-10"); // Saturday: its week is not over
    expect(lastCompletedWeekEnd("2026-10-18")).toBe("2026-10-17"); // Sunday
    expect(weekBounds("2026-10-10")).toEqual({ start: "2026-10-04", end: "2026-10-10", payDate: "2026-10-15" });
  });
});

describe("planPayrollWeek", () => {
  const profiles = [compagnon("a", "Alice"), compagnon("b", "Bruno"), compagnon("c", "Chloé"), compagnon("d", "Dan"), { id: "o", full_name: "Office", role: "admin" }];
  const jobs = [
    job("a1", "a", "2026-10-05"), job("a2", "a", "2026-10-06"),
    job("b1", "b", "2026-10-05"), job("b2", "b", "2026-10-06", "submitted"),
    job("c0", "c", "2026-09-29"), job("c1", "c", "2026-10-05"),
    job("d1", "d", "2026-10-05"),
    job("o1", "o", "2026-10-05"),
  ];
  const ledgerByUser = new Map([
    ["a", [{ user_id: "a", period_end: "2026-10-03", gross_income: 1000 }]],
    ["d", [{ user_id: "d", period_end: "2026-10-10", talon_seq: 7 }]],
  ]);
  const plan = planPayrollWeek({ weekEnd: "2026-10-10", profiles, jobs, ledgerByUser, compute });
  const state = Object.fromEntries(plan.rows.map((row) => [row.profile.id, row.state]));

  it("classifies every CCQ employee of the week; non-CCQ roles are left out (as on the DAS screen)", () => {
    expect(state).toEqual({ a: "ready", b: "pending", c: "blockedEarlier", d: "posted" });
    expect(plan.rows.find((row) => row.profile.id === "c").earlierUnposted).toEqual(["2026-10-03"]);
    expect(plan.ready.map((row) => row.profile.id)).toEqual(["a"]);
  });

  it("opens from the last posted week before this one", () => {
    expect(plan.rows.find((row) => row.profile.id === "a").opening.grossIncome).toBe(1000);
    expect(plan.rows.find((row) => row.profile.id === "a").noOpening).toBe(false);
    expect(plan.rows.find((row) => row.profile.id === "c").noOpening).toBe(true);
  });

  it("totals only posted and ready employees, from the Talon calculation", () => {
    const a = plan.rows.find((row) => row.profile.id === "a");
    const d = plan.rows.find((row) => row.profile.id === "d");
    expect(a.das).toBeCloseTo(a.talon.result.das.total, 6);
    expect(plan.totals.das).toBeCloseTo(a.das + d.das, 6);
    expect(plan.counts).toEqual({ employees: 4, posted: 1, ready: 1, pending: 1, blocked: 1 });
  });

  it("refuses to post behind an already posted later week", () => {
    const later = planPayrollWeek({ weekEnd: "2026-10-10", profiles: [compagnon("a", "Alice")], jobs: [job("a1", "a", "2026-10-05")], ledgerByUser: new Map([["a", [{ user_id: "a", period_end: "2026-10-17" }]]]), compute });
    expect(later.rows[0].state).toBe("blockedLater");
  });
});

describe("posting", () => {
  const plan = planPayrollWeek({ weekEnd: "2026-10-10", profiles: [compagnon("a", "Alice")], jobs: [job("a1", "a", "2026-10-05")], compute });
  const row = plan.ready[0];

  it("writes Calcul's closing snapshot, talon number and kept talon", () => {
    const record = ledgerRowFor({ row, weekEnd: "2026-10-10", weekNo: 42, talonSeq: 12 });
    expect(record).toMatchObject({ user_id: "a", tax_year: 2026, period_end: "2026-10-10", period_start: "2026-10-04", talon_seq: 12 });
    expect(record.gross_income).toBeCloseTo(row.talon.result.ytdAfter.grossIncome / 100, 2);
    expect(record.imported_talon.header.source).toBe("calcul");
    expect(record.imported_talon.header.ref).toBe("D0034-0012");
    expect(ledgerRowFor({ row, weekEnd: "2026-10-10", weekNo: 42, talonSeq: 12, keepsRealStub: true }).imported_talon).toBeUndefined();
  });

  it("numbers talons in posting order and keeps a real stub already kept", async () => {
    const writes = [];
    const fake = {
      from: () => {
        const q = { filters: {} };
        const api = {
          select: () => api, eq: (k, v) => { q.filters[k] = v; return api; }, not: () => api, order: () => api, limit: () => api,
          maybeSingle: async () => (q.filters.user_id ? { data: { talon_seq: null, imported_talon: { header: { source: "import" } } } } : { data: { talon_seq: 41 } }),
          upsert: async (record) => { writes.push(record); return { error: null }; },
        };
        return api;
      },
    };
    const result = await postPayrollWeek(fake, [row], { weekEnd: "2026-10-10", weekNo: 42 });
    expect(result).toEqual({ posted: ["a"], failed: [] });
    expect(writes[0].talon_seq).toBe(42);
    expect(writes[0].imported_talon).toBeUndefined(); // the imported stub stays
  });
});
