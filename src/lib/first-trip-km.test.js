import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));

import { dailyOvertimeEvidenceRequirement } from "./job-submission";
import { mealDecision } from "./meal-eligibility";

// The 65 km rule (owner decision 2026-10-30) must reach every place that counts PAID time of a day, not only the
// pay: the overtime-proof gate and the supper, in the browser and in the database.
const day = "2026-10-27";
const first = (km) => ({ id: "a", job_date: day, depart: "06:00", arrivee: "07:07", fin: "14:29", km_total: km, km_aller: km, km_retour: 0, status: "saved" });

describe("overtime proof gate on paid time", () => {
  it("counts the first trip when the first job is 65 km or more: 8 h 29 of paid time needs the proof", () => {
    expect(dailyOvertimeEvidenceRequirement(first(78), [], { firstTripUnpaid: true })).toMatchObject({ totalMinutes: 509, required: true });
  });
  it("still removes it below 65 km: 8 h 29 − 1 h 07 = 7 h 22, no proof", () => {
    expect(dailyOvertimeEvidenceRequirement(first(64), [], { firstTripUnpaid: true })).toMatchObject({ totalMinutes: 442, required: false });
  });
});

describe("supper on paid work", () => {
  const job = (km) => ({ ...first(km), fin: "16:30", return_time_minutes: 0 }); // 10 h 30 of work
  it("is due with a long first trip paid (10 h 30) and not below 65 km (9 h 23 paid)", () => {
    expect(mealDecision([job(80)], day, { first_trip_unpaid: true }).eligible).toBe(true);
    expect(mealDecision([job(30)], day, { first_trip_unpaid: true }).eligible).toBe(false);
  });
});

describe("migration 0125 (database twins)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261030150000_0125_first_trip_paid_from_65_km.sql", import.meta.url), "utf8");
  it("applies the same rule in the supper function and in the overtime-proof gate", () => {
    expect(sql).toContain("create or replace function public.reconcile_overtime_meal");
    expect(sql).toContain("create or replace function public.validate_job_submission_contract");
    expect(sql.match(/>= date '2026-10-11' and d\.km >= 65 then 0/g)).toHaveLength(2);
    expect(sql.match(/greatest\(coalesce\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("keeps the validator closed to the browser", () => {
    expect(sql).toContain("revoke all on function public.validate_job_submission_contract() from public, anon, authenticated;");
  });
});
