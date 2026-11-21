import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOcrRows } from "./ocr-readings";
import { proofSheetLines } from "./ocr-sheet";

const sql = readFileSync(new URL("../../supabase/migrations/20261121120000_0153_keep_unneeded_overtime_proof.sql", import.meta.url), "utf8");

describe("migration 0153: an unneeded proof is kept", () => {
  it("marks the proof instead of deleting it, and unmarks it when the day passes the line again", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.reconcile_overtime_evidence"), sql.indexOf("create or replace function public.overtime_evidence_clear_not_needed"));
    expect(fn).not.toMatch(/delete from/i);
    expect(fn).toMatch(/set not_needed_at = coalesce\(not_needed_at, now\(\)\)/);
    expect(fn).toMatch(/set not_needed_at = null/);
    // the flag of the job is no longer reset
    expect(fn).not.toMatch(/overtime_evidence_captured\s*=\s*false/);
  });
  it("lets only the server set the mark and backfills the days already under the line", () => {
    expect(sql).toMatch(/before insert on public\.overtime_evidence/);
    expect(sql).toMatch(/new\.not_needed_at := null/);
    expect(sql).toMatch(/overtime_day_minutes\(e\.user_id, e\.job_date\) <= 480/);
  });
});

describe("OCR rows: not needed", () => {
  const job = { id: "j1", user_id: "u1", job_date: "2026-11-19", status: "saved", ot: "202765", depart: "13:45", arrivee: "14:10", fin: "16:45", return_time_minutes: 0 };
  const proof = (extra = {}) => ({ id: "p1", job_id: "j1", user_id: "u1", job_date: "2026-11-19", created_at: "2026-11-19T23:00:00Z", proof_read_at: "2026-11-19T23:01:00Z", ocr_status: "processed", proof_ot: "202765", proof_client_minutes: 90, proof_return_minutes: null, ...extra });
  it("flags a proof the database marked as not needed, and keeps its reading", () => {
    const [row] = buildOcrRows([proof({ not_needed_at: "2026-11-20T15:00:00Z" })], [job], new Map());
    expect(row.notNeeded).toBe(true);
    expect(row.found.clientMinutes).toBe(90);
    const [normal] = buildOcrRows([proof()], [job], new Map());
    expect(normal.notNeeded).toBe(false);
  });
  it("says it on the sheet", () => {
    const [row] = buildOcrRows([proof({ not_needed_at: "2026-11-20T15:00:00Z" })], [job], new Map());
    expect(proofSheetLines(row, (key) => key).some((line) => line.key === "notNeeded")).toBe(true);
  });
});
