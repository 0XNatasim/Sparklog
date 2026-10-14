import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dayFirstTripUnpaidMinutes, isMealEligible, MEAL_AFTER_DAILY_WORK_MINUTES } from "./payroll-calculations";
import { mealDayBreakdown, mealDecision } from "./meal-eligibility";

// Current body of reconcile_overtime_meal (0086); its re-check trigger is still the 0077 one.
const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261013230000_0086_supper_after_2h15_overtime.sql",
  import.meta.url
)), "utf8");
const triggerSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261009170000_0077_meal_on_paid_time.sql",
  import.meta.url
)), "utf8");

// Tuesday 2026-10-06.
const job = (id, depart, fin, extra = {}) => ({ id, job_date: "2026-10-06", depart, arrivee: depart, fin, return_time_minutes: 0, ...extra });
const decide = (jobs, profile = {}) => mealDecision(jobs, "2026-10-06", profile);

describe("supper: 2 h 15 of overtime (1.5× or 2×) = 10 h 15 of work, return excluded (owner decision 2026-10-13)", () => {
  it("is 615 minutes of work", () => expect(MEAL_AFTER_DAILY_WORK_MINUTES).toBe(615));

  it("10 h 15 of work → eligible, whatever the overtime rate", () => {
    expect(decide([job("a", "06:00", "16:15")])).toEqual({ dailyWorkMinutes: 615, eligible: true });
  });

  it("10 h 14 → not eligible", () => {
    expect(decide([job("a", "06:00", "16:14")]).eligible).toBe(false);
  });

  it("adds up every job of the day", () => {
    expect(decide([job("a", "06:00", "12:00"), job("b", "12:00", "16:15")]).eligible).toBe(true);
  });

  it("return time never counts: 11 h 30 span with 1 h 30 of return is 10 h of work", () => {
    const r = decide([job("a", "06:00", "17:30", { return_time_minutes: 90 })]);
    expect(r.dailyWorkMinutes).toBe(600);
    expect(r.eligible).toBe(false);
  });

  it("the unpaid first trip is not work either", () => {
    const day = [{ id: "a", job_date: "2026-10-06", depart: "06:00", arrivee: "06:30", fin: "16:15", return_time_minutes: 0 }];
    expect(decide(day).eligible).toBe(true);
    expect(decide(day, { first_trip_unpaid: true })).toEqual({ dailyWorkMinutes: 585, eligible: false });
    expect(dayFirstTripUnpaidMinutes(day)).toBe(30);
  });

  it("never applies on a weekend", () => {
    expect(isMealEligible({ jobDate: "2026-10-10", dailyWorkMinutes: 900 })).toBe(false);
    expect(isMealEligible({ jobDate: "2026-10-11", dailyWorkMinutes: 900 })).toBe(false);
  });
});

describe("migration 0086 database contract", () => {
  it("excludes return time and uses the same 615-minute threshold", () => {
    expect(sql).toContain("least(greatest(coalesce(s.return_time_minutes, 0), 0), s.span)");
    expect(sql).toContain("(daily_work_minutes - coalesce(unpaid_trip_minutes, 0)) >= 615");
    expect(sql).toContain("p.first_trip_unpaid");
  });

  it("dates the rule change in payroll_rules (v2 emptied, v3 starts)", () => {
    expect(sql).toContain("set effective_to = date '2026-10-13'");
    expect(sql).toContain('"min_daily_work_minutes":615');
    expect(sql).toContain('"return_time_counts":false');
  });

  it("mirrors the engine ordering and clamp for the first trip", () => {
    expect(sql).toContain('order by coalesce(left(j.depart::text, 5), \'\') collate "C", j.id::text collate "C"');
    expect(sql).toContain("d.depart is null or d.arrivee is null or d.fin is null then 0");
  });

  it("re-checks on time or return changes and still only deletes unreviewed claims", () => {
    expect(triggerSql).toContain("after update of depart, arrivee, fin, return_time_minutes on public.jobs");
    expect(sql).toContain("m.reviewed_by is null");
    expect(sql).not.toContain("overtime_evidence");
  });
});

describe("mealDayBreakdown — what the manager sees on a supper", () => {
  // Martin, 2026-10-13: 06:59–12:20 and 12:21–18:15 with 1 h of return and 104 km of return.
  const day = [
    { id: "a", job_date: "2026-10-13", depart: "06:59", arrivee: "08:53", fin: "12:20", return_time_minutes: 0, km_total: 47, km_aller: 47, km_retour: 0 },
    { id: "b", job_date: "2026-10-13", depart: "12:21", arrivee: "14:01", fin: "18:15", return_time_minutes: 60, km_total: 104, km_aller: 0, km_retour: 104 },
  ];

  it("shows presence, return time and kilometres, and the work that decides", () => {
    expect(mealDayBreakdown(day, "2026-10-13", {})).toEqual({
      presenceMinutes: 675, returnMinutes: 60, unpaidTripMinutes: 0, workMinutes: 615, totalKm: 151, returnKm: 104, eligible: true,
    });
  });

  it("takes the unpaid first trip out too, for employees with that option", () => {
    const b = mealDayBreakdown(day, "2026-10-13", { first_trip_unpaid: true });
    expect(b.unpaidTripMinutes).toBe(114); // 06:59 → 08:53
    expect(b.workMinutes).toBe(615 - 114);
    expect(b.eligible).toBe(false);
  });
});
