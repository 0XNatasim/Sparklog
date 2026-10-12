import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectJobAnomalies } from "./job-anomalies";

const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261009150000_0076_overtime_proof_on_paid_time.sql",
  import.meta.url
)), "utf8");

describe("migration 0076: the overtime proof follows paid time", () => {
  it("looks up the employee's option and removes the first trip before the 8 h test", () => {
    expect(sql).toContain("coalesce(p.first_trip_unpaid, false)");
    expect(sql).toContain("duration_minutes + other_minutes - coalesce(unpaid_trip_minutes, 0) > 480");
  });

  it("mirrors the engine: earliest Départ then id, clamped to Départ→Fin, none without Arrivée", () => {
    expect(sql).toContain('order by coalesce(left(x.depart::text, 5), \'\') collate "C", x.id::text collate "C"');
    expect(sql).toContain("d.depart is null or d.arrivee is null or d.fin is null then 0");
    expect(sql).toContain("least(");
  });

  it("keeps the rest of the 0072 gate (inventory, overlap, return time, kilometres)", () => {
    for (const keyword of ["inventory_screenshots_required", "overlapping_job_interval", "return_time_exceeds_job_interval", "invalid_job_kilometres", "overtime_evidence_required"]) {
      expect(sql).toContain(keyword);
    }
  });
});

describe("manager anomaly scan with the first-trip-unpaid option", () => {
  const job = (id, depart, arrivee, fin) => ({
    id, user_id: "jm", job_date: "2026-10-09", status: "submitted", depart, arrivee, fin,
    overtime_evidence_captured: false, km_total: 10, km_aller: 10, km_retour: 0,
  });
  const day = [job("a", "06:30", "07:00", "08:45"), job("b", "08:45", "08:55", "11:34"), job("c", "11:35", "12:04", "15:00")];

  it("flags 8 h 29 gross without proof for a regular employee", () => {
    const types = detectJobAnomalies(day).map((a) => a.type);
    expect(types).toContain("overtime_no_evidence");
  });

  it("does not flag the same day when the unpaid trip brings it to 7 h 59", () => {
    const types = detectJobAnomalies(day, undefined, { firstTripUnpaidUsers: new Set(["jm"]) }).map((a) => a.type);
    expect(types).not.toContain("overtime_no_evidence");
  });
});
