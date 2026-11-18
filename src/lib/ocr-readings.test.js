import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildOcrRows, canReread, countOcrStates, filterOcrRows } from "./ocr-readings";
import { expectedProofForJob } from "./overtime-proof-check";

const job = (id, depart, fin, extra = {}) => ({ id, user_id: "u1", job_date: "2026-11-16", status: "submitted", ot: "261821", depart, fin, return_time_minutes: 0, ...extra });
const people = new Map([["u1", { id: "u1", full_name: "Alex Test" }]]);
const proof = (id, jobId, extra = {}) => ({ id, job_id: jobId, user_id: "u1", job_date: "2026-11-16", created_at: "2026-11-16T22:00:00Z", proof_read_at: "2026-11-16T22:01:00Z", ...extra });

describe("expectedProofForJob", () => {
  // 06:30-10:30 (4 h), 11:00-16:00 (5 h), 16:00-18:00 (2 h): the line (8 h) is crossed by the 2nd work order.
  const day = [job("a", "06:30", "10:30"), job("b", "11:00", "16:00", { ot: "OT-208637" }), job("c", "16:00", "18:00", { ot: "300111" })];
  it("gives each work order its own share beyond the line", () => {
    expect(expectedProofForJob(day, day[0])).toEqual({ ot: "261821", clientMinutes: 0, returnMinutes: 0 });
    expect(expectedProofForJob(day, day[1])).toEqual({ ot: "208637", clientMinutes: 60, returnMinutes: 0 });
    expect(expectedProofForJob(day, day[2])).toEqual({ ot: "300111", clientMinutes: 120, returnMinutes: 0 });
  });
  it("leaves the return time and the 10 h day out", () => {
    const withReturn = [job("a", "06:30", "16:30", { return_time_minutes: 30 }), job("b", "16:30", "18:00", { return_time_minutes: 15 })];
    expect(expectedProofForJob(withReturn, withReturn[0])).toEqual({ ot: "261821", clientMinutes: 90, returnMinutes: 30 });
    expect(expectedProofForJob(withReturn, withReturn[1]).clientMinutes).toBe(75); // 645 min of work − 480
    expect(expectedProofForJob(withReturn, withReturn[1], { tenHourDay: true }).clientMinutes).toBe(45); // 645 − 600
    expect(expectedProofForJob(day, { id: "zzz" })).toBeNull();
  });
});

describe("buildOcrRows", () => {
  const jobs = [job("a", "06:30", "14:30"), job("b", "14:30", "17:00", { ot: "208637" })];
  it("compares each proof with its own work order and flags the differing values", () => {
    const rows = buildOcrRows([
      proof("p1", "b", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      proof("p2", "b", { proof_ot: "999999", proof_client_minutes: 150, proof_return_minutes: 0 }),
      proof("p3", "b", { proof_ot: null, proof_client_minutes: null, proof_return_minutes: null }),
      proof("p4", "b", { proof_read_at: null }),
      proof("p5", "b", { ocr_status: "failed" }),
    ], jobs, people);
    const state = Object.fromEntries(rows.map((row) => [row.id, row.state]));
    // p5: the reading service did not answer (« failed »): nothing was read, which is not the same as an unreadable picture.
    expect(state).toEqual({ p1: "ok", p2: "mismatch", p3: "unread", p4: "notRead", p5: "failed" });
    expect(rows.filter(canReread).map((row) => row.id).sort()).toEqual(["p3", "p5"]);
    expect(rows.find((row) => row.id === "p2").wrong.has("ot")).toBe(true);
    expect(rows.find((row) => row.id === "p1").name).toBe("Alex Test");
    expect(rows.find((row) => row.id === "p1").expected).toEqual({ ot: "208637", clientMinutes: 150, returnMinutes: 0 });
  });
  it("filters by state and by search text, and counts the states", () => {
    const rows = buildOcrRows([
      proof("p1", "b", { proof_ot: "208637", proof_client_minutes: 150, proof_return_minutes: 0 }),
      proof("p3", "b", {}),
      proof("p4", "b", { proof_read_at: null }),
    ], jobs, people);
    expect(filterOcrRows(rows, { state: "read" }).map((row) => row.id).sort()).toEqual(["p1", "p3"]);
    expect(filterOcrRows(rows, { state: "check" }).map((row) => row.id)).toEqual(["p3"]);
    expect(filterOcrRows(rows, { state: "reread" }).map((row) => row.id)).toEqual(["p3"]);
    expect(filterOcrRows(rows, { state: "all", query: "alex" })).toHaveLength(3);
    expect(filterOcrRows(rows, { state: "all", query: "zzz" })).toHaveLength(0);
    expect(countOcrStates(rows)).toEqual({ ok: 1, mismatch: 0, unread: 1, failed: 0, notRead: 1 });
  });
});

describe("process_overtime_evidence (source)", () => {
  const source = readFileSync(fileURLToPath(new URL("../../supabase/functions/process_overtime_evidence/index.ts", import.meta.url)), "utf8");
  it("tries OCR.space again on 429 / 5xx before giving up", () => {
    expect(source).toContain("response.status !== 429 && response.status < 500");
    expect(source).toContain("attempt < 3");
  });
  it("lets only a manager read again a failed or empty proof, and leaves the owner path as it was", () => {
    expect(source).toContain("body?.reread === true");
    expect(source).toContain('caller.rpc("get_my_role")');
    expect(source).toContain('role !== "manager"');
    expect(source).toContain('evidence.ocr_status !== "failed" && evidence.ocr_status !== "needs_review"');
    expect(source).toContain('evidence.ocr_status !== "pending"');
    expect(source).toContain("evidence.user_id !== userData.user.id");
  });
});
