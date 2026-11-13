import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAILY_REGULAR_MINUTES, TEN_HOUR_DAY_MINUTES, calculatePayrollEntries, dailyRegularMinutesFor, isMealEligible, overtimeOptionsFromProfile } from "./payroll-calculations";
import { dailyOvertimeEvidenceRequirement } from "./job-submission";
import { detectJobAnomalies } from "./job-anomalies";
import { mealDecision } from "./meal-eligibility";

// « 4 jours de 10 h » (0135, engine 2.9.0): overtime starts after 10 h of work instead of 8 h.
const job = (id, date, depart, fin, extra = {}) => ({ id, user_id: "u1", job_date: date, depart, arrivee: depart, fin, km_aller: 10, status: "submitted", ...extra });
const sum = (entries, key) => [...entries.values()].reduce((total, entry) => total + entry[key], 0);
const ten = overtimeOptionsFromProfile({ role: "employee", ten_hour_days: true });
const plain = overtimeOptionsFromProfile({ role: "employee" });

describe("engine: daily regular minutes", () => {
  it("is 8 h by default and 10 h with the option, never for a subcontractor or a foreman", () => {
    expect(DAILY_REGULAR_MINUTES).toBe(480);
    expect(TEN_HOUR_DAY_MINUTES).toBe(600);
    expect(dailyRegularMinutesFor({ role: "employee" })).toBe(480);
    expect(dailyRegularMinutesFor({ role: "employee", ten_hour_days: true })).toBe(600);
    expect(dailyRegularMinutesFor({ role: "subcontractor_1", ten_hour_days: true })).toBe(480);
    expect(dailyRegularMinutesFor({ role: "foreman", ten_hour_days: true })).toBe(480);
    expect(dailyRegularMinutesFor(null)).toBe(480);
  });

  it("pays 10 h as regular time and starts overtime after them (Tuesday 2026-11-03)", () => {
    const day = [job("a", "2026-11-03", "06:00", "17:00")]; // 11 h
    const withOption = calculatePayrollEntries(day, ten);
    expect(sum(withOption, "regularWorkMinutes")).toBe(600);
    expect(sum(withOption, "overtime50Minutes")).toBe(60);
    expect(sum(withOption, "overtime100Minutes")).toBe(0);
    const without = calculatePayrollEntries(day, plain);
    expect(sum(without, "regularWorkMinutes")).toBe(480);
    expect(sum(without, "overtime50Minutes")).toBe(60);
    expect(sum(without, "overtime100Minutes")).toBe(120);
    expect(sum(withOption, "totalPaidMinutes")).toBe(sum(without, "totalPaidMinutes")); // same time, split differently
  });

  it("keeps the 8 h split when the box is off, and a short day is unchanged", () => {
    const day = [job("a", "2026-11-03", "08:00", "15:00")];
    expect(sum(calculatePayrollEntries(day, ten), "regularWorkMinutes")).toBe(420);
    expect(sum(calculatePayrollEntries(day, ten), "overtimeWorkMinutes")).toBe(0);
  });

  it("splits the 10 h threshold across several jobs of the day", () => {
    const day = [job("a", "2026-11-03", "06:00", "11:00"), job("b", "2026-11-03", "12:00", "18:00")]; // 5 h + 6 h
    const entries = calculatePayrollEntries(day, ten);
    expect(sum(entries, "regularWorkMinutes")).toBe(600);
    expect(sum(entries, "overtimeWorkMinutes")).toBe(60);
    expect(entries.get("b").overtimeWorkMinutes).toBe(60);
  });

  it("is still a Saturday of overtime only", () => {
    const entries = calculatePayrollEntries([job("a", "2026-11-07", "08:00", "14:00")], ten);
    expect(sum(entries, "regularWorkMinutes")).toBe(0);
    expect(sum(entries, "overtimeWorkMinutes")).toBe(360);
  });
});

describe("gates follow the threshold", () => {
  const day = [job("a", "2026-11-03", "06:00", "17:00")];
  it("asks the overtime proof after 10 h, not 8 h", () => {
    const candidate = { ...day[0], status: "saved" };
    expect(dailyOvertimeEvidenceRequirement(candidate, []).required).toBe(true);
    expect(dailyOvertimeEvidenceRequirement(candidate, [], { dailyRegularMinutes: 600 }).required).toBe(true);
    const nineHours = { ...day[0], fin: "15:00", status: "saved" };
    expect(dailyOvertimeEvidenceRequirement(nineHours, []).required).toBe(true);
    expect(dailyOvertimeEvidenceRequirement(nineHours, [], { dailyRegularMinutes: 600 }).required).toBe(false);
  });

  it("owes no supper at all to an employee on 4 days of 10 h (engine 2.10.0)", () => {
    expect(isMealEligible({ jobDate: "2026-11-03", dailyWorkMinutes: 615 })).toBe(true);
    expect(isMealEligible({ jobDate: "2026-11-03", dailyWorkMinutes: 615, dailyRegularMinutes: 600 })).toBe(false);
    expect(isMealEligible({ jobDate: "2026-11-03", dailyWorkMinutes: 735, dailyRegularMinutes: 600 })).toBe(false);
    expect(isMealEligible({ jobDate: "2026-11-03", dailyWorkMinutes: 900, dailyRegularMinutes: 600 })).toBe(false);
    const eleven = [job("a", "2026-11-03", "06:00", "17:00")];
    expect(mealDecision(eleven, "2026-11-03", { role: "employee" }).eligible).toBe(true);
    expect(mealDecision(eleven, "2026-11-03", { role: "employee", ten_hour_days: true }).eligible).toBe(false);
  });

  it("flags a day over the threshold with no proof, 2 h later for the option", () => {
    const nine = [job("a", "2026-11-03", "06:00", "15:00")];
    expect(detectJobAnomalies(nine).map((a) => a.type)).toContain("overtime_no_evidence");
    expect(detectJobAnomalies(nine, undefined, { tenHourUsers: new Set(["u1"]) }).map((a) => a.type)).not.toContain("overtime_no_evidence");
    const eleven = [job("a", "2026-11-03", "06:00", "17:00")];
    expect(detectJobAnomalies(eleven, undefined, { tenHourUsers: new Set(["u1"]) }).map((a) => a.type)).toContain("overtime_no_evidence");
  });
});

describe("migration 0135", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261111120000_0135_ten_hour_days.sql", import.meta.url), "utf8");
  it("adds the column, off by default", () => {
    expect(sql).toContain("add column if not exists ten_hour_days boolean not null default false");
  });
  it("moves the proof gate to 10 h and the supper to 12 h 15, never for a subcontractor or a foreman", () => {
    expect(sql).toMatch(/daily_regular_minutes := 600/);
    expect(sql).toMatch(/> daily_regular_minutes/);
    expect(sql).toMatch(/then 735 else 615/);
    expect((sql.match(/not in \('foreman', 'subcontractor_1'\)/g) || []).length).toBe(2);
  });
});

describe("migration 0139", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114180000_0139_no_supper_ten_hour_days.sql", import.meta.url), "utf8");
  it("makes an employee on 4 days of 10 h never eligible to the supper, except a subcontractor or a foreman", () => {
    expect(sql).toContain("and not exists (select 1 from public.profiles p");
    expect(sql).toContain("p.ten_hour_days");
    expect(sql).toContain("not in ('foreman', 'subcontractor_1')");
    expect(sql).toContain(">= 615");
    expect(sql).not.toContain("735");
  });
});

