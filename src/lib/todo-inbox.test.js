import { describe, expect, it } from "vitest";
import { approvalOutcome, buildInbox, completeDaysOnly, matchesPerson, previousWorkday } from "./todo-inbox";

const job = (id, user_id, job_date, depart, fin, extra = {}) => ({ id, user_id, job_date, depart, fin, status: "submitted", ot: id, km_total: 10, ...extra });
const profiles = new Map([["a", { id: "a", full_name: "Alice" }], ["b", { id: "b", full_name: "Bruno" }]]);

describe("buildInbox", () => {
  const submittedJobs = [
    job("a1", "a", "2026-10-06", "07:00", "12:00"),
    job("a2", "a", "2026-10-06", "12:30", "17:00"),
    job("a3", "a", "2026-10-07", "07:00", "15:00"),
    job("b1", "b", "2026-10-06", "07:00", "20:30"),
    job("x", "b", "2026-10-07", "07:00", "15:00", { status: "approved" }),
  ];
  const anomalies = [{ key: "long_day:b1", type: "long_day", userId: "b", jobDate: "2026-10-06", jobIds: ["b1"], minutes: 810 }];
  const inbox = buildInbox({
    submittedJobs, profiles, anomalies,
    evidenceRows: [{ job_id: "a2", storage_path: "p.jpg" }],
    meals: [{ id: "m1", user_id: "a", job_date: "2026-10-06", amount: 30 }, { id: "m2", user_id: "b", job_date: "2026-09-29", amount: 30 }],
    parking: [{ job_id: "a3", user_id: "a", job_date: "2026-10-07", amount: 14 }],
  });

  it("groups submitted jobs into days per employee, anomalies apart", () => {
    expect(inbox.anomalyDays.map((d) => d.key)).toEqual(["b|2026-10-06"]);
    expect(inbox.employees.map((e) => e.name)).toEqual(["Alice"]);
    expect(inbox.employees[0].days.map((d) => d.date)).toEqual(["2026-10-06", "2026-10-07"]);
    expect(inbox.employees[0].days[0].minutes).toBe(5 * 60 + 4.5 * 60);
  });

  it("attaches proof, supper and parking to their day; others are listed apart", () => {
    const [mon, tue] = inbox.employees[0].days;
    expect(mon.evidence.map((r) => r.job_id)).toEqual(["a2"]);
    expect(mon.meals.map((m) => m.id)).toEqual(["m1"]);
    expect(tue.parking.map((p) => p.job_id)).toEqual(["a3"]);
    expect(inbox.orphanClaims.map((c) => `${c.kind}:${c.id || c.job_id}`)).toEqual(["meal:m2"]);
  });

  it("bulk approval covers only days without anomaly, and never approved jobs", () => {
    expect(inbox.cleanJobIds.sort()).toEqual(["a1", "a2", "a3"]);
    expect(inbox.stats).toEqual({ days: 3, cleanDays: 2, anomalyDays: 1, pendingClaims: 3 });
  });
});

describe("previousWorkday", () => {
  it("skips the weekend", () => {
    expect(previousWorkday("2026-10-13")).toBe("2026-10-12"); // Tuesday → Monday
    expect(previousWorkday("2026-10-12")).toBe("2026-10-09"); // Monday → Friday
    expect(previousWorkday("2026-10-11")).toBe("2026-10-09"); // Sunday → Friday
  });
});

describe("approvalOutcome", () => {
  it("trusts the per-job results: exported or already exported are approved", () => {
    const data = { ok: true, results: [{ job_id: "a", outcome: "exported" }, { job_id: "b", outcome: "already_exported" }, { job_id: "c", outcome: "state_changed" }] };
    expect(approvalOutcome(data, ["a", "b", "c", "d"])).toEqual({ approved: ["a", "b"], stale: ["c", "d"] });
  });

  it("falls back to counts for older deployments", () => {
    expect(approvalOutcome({ ok: true, exported: 2 }, ["a", "b"])).toEqual({ approved: ["a", "b"], stale: [] });
    expect(approvalOutcome({ ok: true, exported: 1 }, ["a", "b"])).toEqual({ approved: [], stale: ["a", "b"] });
  });
});

describe("completeDaysOnly", () => {
  const jobs = [
    { id: 1, job_date: "2026-10-13" }, { id: 2, job_date: "2026-10-14" }, { id: 3, job_date: "2026-10-14" },
  ];
  it("keeps the whole queue when nothing was cut", () => {
    expect(completeDaysOnly(jobs, false)).toBe(jobs);
  });
  it("drops the last date read when the budget cut the list (it may be partial)", () => {
    expect(completeDaysOnly(jobs, true).map((job) => job.id)).toEqual([1]);
  });
  it("keeps a single cut date rather than showing nothing", () => {
    const sameDay = jobs.slice(1);
    expect(completeDaysOnly(sameDay, true)).toBe(sameDay);
  });
});

describe("matchesPerson", () => {
  it("matches the name or e-mail without accents or case", () => {
    const p = { full_name: "Hélène Côté", email: "hcote@example.com" };
    expect(matchesPerson(p, "")).toBe(true);
    expect(matchesPerson(p, "helene")).toBe(true);
    expect(matchesPerson(p, "COTE")).toBe(true);
    expect(matchesPerson(p, "hcote@")).toBe(true);
    expect(matchesPerson(p, "simon")).toBe(false);
  });
});
