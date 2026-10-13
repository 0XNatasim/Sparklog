import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dayFirstTripUnpaidMinutes, isMealEligible, MEAL_DOUBLE_TIME_MINUTES } from "./payroll-calculations";
import { mealDecision, payrollWeekRange } from "./meal-eligibility";

// Current body of reconcile_overtime_meal (0086); its re-check trigger is still the 0077 one.
const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261013230000_0086_supper_after_2h15_double_time.sql",
  import.meta.url
)), "utf8");
const triggerSql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20261009170000_0077_meal_on_paid_time.sql",
  import.meta.url
)), "utf8");

// Week of Sunday 2026-10-04 → Saturday 2026-10-10. Monday 10-05, Tuesday 10-06.
const job = (id, job_date, depart, fin, extra = {}) => ({ id, job_date, depart, arrivee: depart, fin, return_time_minutes: 0, ...extra });
const decide = (jobs, date, profile = {}) => mealDecision(jobs, date, profile, []);

describe("supper: 2,25 h paid at double time, return excluded (owner decision 2026-10-13)", () => {
  it("is 135 minutes", () => expect(MEAL_DOUBLE_TIME_MINUTES).toBe(135));

  it("10 h 15 on the day the week's first overtime hour falls → only 1 h 15 at 2×, not eligible", () => {
    const r = decide([job("m", "2026-10-05", "06:00", "16:15")], "2026-10-05");
    expect(r.doubleTimeMinutes).toBe(75);
    expect(r.eligible).toBe(false);
  });

  it("11 h 15 that day → 2 h 15 at 2×, eligible", () => {
    const r = decide([job("m", "2026-10-05", "06:00", "17:15")], "2026-10-05");
    expect(r.doubleTimeMinutes).toBe(135);
    expect(r.eligible).toBe(true);
  });

  it("10 h 15 once the week's 1.5× hour is used on an earlier day → eligible", () => {
    const week = [job("m", "2026-10-05", "06:00", "15:00"), job("t", "2026-10-06", "06:00", "16:15")];
    const r = decide(week, "2026-10-06");
    expect(r.doubleTimeMinutes).toBe(135);
    expect(r.eligible).toBe(true);
  });

  it("10 h 14 the same way → 2 h 14 at 2×, not eligible", () => {
    const week = [job("m", "2026-10-05", "06:00", "15:00"), job("t", "2026-10-06", "06:00", "16:14")];
    expect(decide(week, "2026-10-06").eligible).toBe(false);
  });

  it("with the « first overtime hour at double » option 10 h 15 is enough on any day", () => {
    const r = decide([job("m", "2026-10-05", "06:00", "16:15")], "2026-10-05", { overtime_first_hour_double: true });
    expect(r.doubleTimeMinutes).toBe(135);
    expect(r.eligible).toBe(true);
  });

  it("return time never counts: 11 h 30 span with 1 h 30 of return is 10 h of work", () => {
    const week = [job("m", "2026-10-05", "06:00", "15:00"), job("t", "2026-10-06", "06:00", "17:30", { return_time_minutes: 90 })];
    const r = decide(week, "2026-10-06");
    expect(r.doubleTimeMinutes).toBe(120);
    expect(r.eligible).toBe(false);
  });

  it("the unpaid first trip is not paid, so it is not double time either", () => {
    const week = [job("m", "2026-10-05", "06:00", "15:00"),
      { id: "t", job_date: "2026-10-06", depart: "06:00", arrivee: "06:30", fin: "16:15", return_time_minutes: 0 }];
    expect(decide(week, "2026-10-06").eligible).toBe(true);
    expect(decide(week, "2026-10-06", { first_trip_unpaid: true }).eligible).toBe(false);
    expect(dayFirstTripUnpaidMinutes([week[1]])).toBe(30);
  });

  it("never applies on a weekend", () => {
    expect(isMealEligible({ jobDate: "2026-10-10", doubleTimeMinutes: 600 })).toBe(false);
    expect(isMealEligible({ jobDate: "2026-10-11", doubleTimeMinutes: 600 })).toBe(false);
  });

  it("uses the Sunday → Saturday payroll week", () => {
    expect(payrollWeekRange("2026-10-06")).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(payrollWeekRange("2026-10-04")).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(payrollWeekRange("2026-10-10")).toEqual({ start: "2026-10-04", end: "2026-10-10" });
  });
});

describe("migration 0086 database contract", () => {
  it("withdraws a pending claim only when the day cannot reach 8 h + 2,25 h of work without return", () => {
    expect(sql).toContain("least(greatest(coalesce(s.return_time_minutes, 0), 0), s.span)");
    expect(sql).toContain("(daily_work_minutes - coalesce(unpaid_trip_minutes, 0)) >= 615");
    expect(sql).toContain("p.first_trip_unpaid");
  });

  it("dates the rule change in payroll_rules (v2 emptied, v3 starts)", () => {
    expect(sql).toContain("set effective_to = date '2026-10-13'");
    expect(sql).toContain('"min_double_time_minutes":135');
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
