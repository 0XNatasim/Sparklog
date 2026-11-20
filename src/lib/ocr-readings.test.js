import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
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
      proof("p6", "b", { ocr_status: "pending", proof_read_at: null }),
      proof("p7", "b", { ocr_status: "wrong_document" }),
    ], jobs, people);
    const state = Object.fromEntries(rows.map((row) => [row.id, row.state]));
    // p5: the reading service did not answer (« failed »): nothing was read, which is not the same as an unreadable picture.
    expect(state).toEqual({ p1: "ok", p2: "mismatch", p3: "unread", p4: "notRead", p5: "failed", p6: "queued", p7: "wrongDoc" });
    expect(rows.filter(canReread).map((row) => row.id).sort()).toEqual(["p3", "p5", "p7"]); // a wrong document can be read again in case the reader was wrong
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
    expect(countOcrStates(rows)).toEqual({ ok: 1, mismatch: 0, wrongDoc: 0, unread: 1, failed: 0, queued: 0, notRead: 1 });
  });
});

describe("the wrong screenshot (migration 0148 and process_overtime_evidence)", () => {
  const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const fn = read("../../supabase/functions/process_overtime_evidence/index.ts");
  const sql = read("../../supabase/migrations/20261118230000_0148_overtime_proof_wrong_document.sql");

  it("marks anything that is not the form `wrong_document` and drops the numbers read on it", () => {
    expect(fn).toContain("isOvertimeFormText(text)");
    expect(fn).toContain('status = "wrong_document"');
    expect(fn).toContain("parsed = { ot: null, clientMinutes: null, returnMinutes: null }");
    expect(fn).not.toContain('(overtimeFormFound(parsed) || validatesOvertimeSms(text)) ? "processed"'); // the old test: an OT number alone proved nothing
  });

  it("allows the new status and lets a manager put such a proof back in the queue", () => {
    expect(sql).toContain("check (ocr_status in ('pending', 'processed', 'needs_review', 'failed', 'wrong_document'))");
    expect(sql).toContain("ocr_status in ('failed', 'needs_review', 'wrong_document')");
  });
});

describe("the reading queue (migration 0147 and process_overtime_evidence)", () => {
  const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const fn = read("../../supabase/functions/process_overtime_evidence/index.ts");
  const sql = read("../../supabase/migrations/20261118210000_0147_overtime_proof_read_queue.sql");

  it("reads one proof a minute, never tried first, then the one tried longest ago", () => {
    expect(sql).toContain("cron.schedule('ocr-proofs-queue', '* * * * *'");
    expect(sql).toContain("order by e.ocr_last_try_at nulls first, e.created_at");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("ocr_next_try_at = now() + interval '5 minutes'");
    expect(sql).toContain("grant execute on function public.claim_next_overtime_proof() to service_role");
  });

  it("puts a refused proof at the bottom, waits 10 minutes per attempt, and gives up after 5", () => {
    expect(fn).toContain("const MAX_ATTEMPTS = 5");
    expect(fn).toContain("ocr_last_try_at: new Date().toISOString()");
    expect(fn).toContain("attempts * 10 * 60 * 1000");
    expect(fn).toContain('ocr_status: "failed"');
    expect(fn).not.toContain("attempt < 3"); // no immediate retry loop: the queue decides
  });

  it("lets only the scheduled job read, and only a manager put proofs back; the employee's call just queues", () => {
    expect(fn).toContain('admin.rpc("verify_cron_secret"');
    expect(fn).toContain('admin.rpc("claim_next_overtime_proof")');
    expect(fn).toContain("evidence.user_id !== userData.user.id");
    expect(fn).not.toContain("EdgeRuntime.waitUntil(processEvidence(admin, evidence))");
    expect(sql).toContain("public.get_my_role()) is distinct from 'manager'");
    expect(sql).toContain("revoke all on function public.requeue_overtime_proofs(uuid[]) from public, anon");
  });

  it("keeps the employee from choosing his place in the queue", () => {
    expect(sql).toContain("new.ocr_attempts := 0;");
    expect(sql).toContain("new.ocr_next_try_at := null;");
  });
});

describe("renvoi automatique d'une mauvaise preuve (0149)", () => {
  const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20261119120000_0149_auto_return_wrong_proof.sql"), "utf8");
  const fn = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/functions/process_overtime_evidence/index.ts"), "utf8");
  it("l'interrupteur est coupé par défaut et la fonction est réservée au service", () => {
    expect(sql).toMatch(/auto_return_wrong_proof boolean not null default false/);
    expect(sql).toMatch(/grant execute on function public\.auto_return_wrong_proof\(uuid\) to service_role/);
    expect(sql).toMatch(/revoke all on function public\.auto_return_wrong_proof\(uuid\) from public, anon, authenticated/);
  });
  it("ne touche qu'une fiche soumise et seulement si l'interrupteur est actif", () => {
    expect(sql).toMatch(/enabled is not true/);
    expect(sql).toMatch(/current_job\.status <> 'submitted'/);
    expect(sql).toMatch(/'job_returned_wrong_proof'/);
  });
  it("la fonction Edge l'appelle seulement pour wrong_document", () => {
    expect(fn).toMatch(/status === "wrong_document"[\s\S]*auto_return_wrong_proof/);
  });
});

describe("tout relire (0150)", () => {
  const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20261120120000_0150_requeue_any_proof.sql"), "utf8");
  it("lets a manager put any reading back in the queue, but never one already waiting", () => {
    expect(sql).toMatch(/ocr_status <> 'pending'/);
    expect(sql).not.toMatch(/ocr_status in \('failed'/);
    expect(sql).toMatch(/get_my_role\(\)\) is distinct from 'manager'/);
    expect(sql).toMatch(/array_length\(p_ids, 1\) > 300/);
  });
});

describe("interrupteur du retour pour correction (0151)", () => {
  const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20261120140000_0151_ocr_send_back_setting.sql"), "utf8");
  it("is off by default and lives on the overtime settings row", () => {
    expect(sql).toMatch(/add column if not exists send_back_enabled boolean not null default false/);
    expect(sql).toMatch(/alter table public\.overtime_settings/);
  });
});
