import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dailyOvertimeEvidenceRequirement } from "./job-submission";
import { dayFirstTripUnpaidMinutes, isMealEligible } from "./payroll-calculations";

const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261009170000_0077_meal_on_paid_time.sql",
  import.meta.url
)), "utf8");

// Wednesday. Jobs: 06:00-09:00 (arrival 06:30 => 30 min unpaid trip), 09:00-13:00, 13:00-fin.
const day = [
  { id: "a", job_date: "2026-10-07", depart: "06:00", arrivee: "06:30", fin: "09:00", status: "saved" },
  { id: "b", job_date: "2026-10-07", depart: "09:00", arrivee: "09:10", fin: "13:00", status: "saved" },
];
const last = (fin) => ({ id: "c", job_date: "2026-10-07", depart: "13:00", arrivee: "13:20", fin, status: "saved" });
const paid = (fin, firstTripUnpaid) => dailyOvertimeEvidenceRequirement(last(fin), day, { firstTripUnpaid }).totalMinutes;
const eligible = (fin, firstTripUnpaid) => isMealEligible({ jobDate: "2026-10-07", dailyWorkMinutes: paid(fin, firstTripUnpaid) });

describe("supper eligibility on paid time", () => {
  it("is unchanged without the option: 630 min gross is eligible", () => {
    expect(paid("16:30", false)).toBe(630);
    expect(eligible("16:30", false)).toBe(true);
  });

  it("with the option the 30-minute first trip no longer counts: 600 min, not eligible", () => {
    expect(paid("16:30", true)).toBe(600);
    expect(eligible("16:30", true)).toBe(false);
  });

  it("is eligible again at exactly 615 paid minutes, and not one minute before", () => {
    expect(paid("16:45", true)).toBe(615);
    expect(eligible("16:45", true)).toBe(true);
    expect(eligible("16:44", true)).toBe(false);
  });

  it("never applies on a weekend whatever the paid time", () => {
    expect(isMealEligible({ jobDate: "2026-10-10", dailyWorkMinutes: 900 })).toBe(false);
  });

  it("uses the same unpaid trip as the overtime proof and the payroll", () => {
    expect(dayFirstTripUnpaidMinutes([...day, last("16:30")])).toBe(30);
  });
});

describe("migration 0077 database contract", () => {
  it("deducts the unpaid first trip before the 135-minute overtime test", () => {
    expect(sql).toContain("p.first_trip_unpaid");
    expect(sql).toContain("(daily_minutes - coalesce(unpaid_trip_minutes, 0) - 480) >= 135");
  });

  it("mirrors the engine ordering and clamp", () => {
    expect(sql).toContain('order by coalesce(left(j.depart::text, 5), \'\') collate "C", j.id::text collate "C"');
    expect(sql).toContain("d.depart is null or d.arrivee is null or d.fin is null then 0");
    expect(sql).toContain("least(");
  });

  it("re-checks when the first job's Arrivée changes and still only deletes unreviewed claims", () => {
    expect(sql).toContain("after update of depart, arrivee, fin, return_time_minutes on public.jobs");
    expect(sql).toContain("m.reviewed_by is null");
    expect(sql).not.toContain("overtime_evidence");
  });
});
