import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { approvalOutcome, buildInbox, expectedVersions, previousWorkday } from "./todo-inbox";

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

  it("skips a CCQ holiday like a weekend", () => {
    // Thanksgiving 2026-10-12 (convention ICI 19.04): Tuesday looks back to the Friday before.
    expect(previousWorkday("2026-10-13", ["2026-10-12"])).toBe("2026-10-09");
    // Construction vacation and Christmas: the first day back looks past the whole shutdown.
    const winter = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"];
    expect(previousWorkday("2027-01-04", winter)).toBe("2026-12-18");
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

// S-4: two managers on the same job — approval is refused when the job changed since it was read.
describe("expectedVersions (S-4)", () => {
  const rows = [
    { id: "a", updated_at: "2026-11-02T10:00:00.123456+00:00" },
    { id: "b", updated_at: "2026-11-02T11:00:00+00:00" },
    { id: "c" },
  ];

  it("keeps the version of each requested job only", () => {
    expect(expectedVersions(["a", "c"], rows)).toEqual({ a: "2026-11-02T10:00:00.123456+00:00" });
  });

  it("tolerates missing rows", () => {
    expect(expectedVersions(["a"], undefined)).toEqual({});
  });

  it("treats a version_changed outcome as stale, never as approved", () => {
    const data = { results: [{ job_id: "a", outcome: "version_changed" }, { job_id: "b", outcome: "exported" }] };
    expect(approvalOutcome(data, ["a", "b"])).toEqual({ approved: ["b"], stale: ["a"] });
  });

  it("the Edge Function compares the version before claiming and stays optional", () => {
    const src = readFileSync(new URL("../../supabase/functions/push_approved_batch/index.ts", import.meta.url), "utf8");
    expect(src).toContain("expected_updated_at");
    expect(src).toContain('outcome: "version_changed"');
    // version check happens in the eligibility filter, before the atomic claim.
    expect(src.indexOf("versionChanged(j)")).toBeLessThan(src.indexOf("Idempotent claim"));
    // an absent map keeps the old behaviour (typeof guard).
    expect(src).toContain('typeof expected[j.id] === "string"');
  });

  it("every approval caller sends the versions it saw", () => {
    for (const file of ["../components/manager/TodoInbox.jsx", "../pages/ManagerDashboard.jsx"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      const calls = src.match(/push_approved_batch"/g)?.length ?? 0;
      const sends = src.match(/expected_updated_at: expectedVersions/g)?.length ?? 0;
      expect(sends).toBe(calls);
    }
  });
});
