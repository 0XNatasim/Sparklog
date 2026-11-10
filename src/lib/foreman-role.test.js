import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, FOREMAN_DAY_MINUTES, calculatePayrollEntries, overtimeOptionsFromProfile } from "./payroll-calculations";

const job = (id, date, depart, fin, extra = {}) => ({ id, job_date: date, depart, arrivee: depart, fin, km_aller: 10, ...extra });
const options = overtimeOptionsFromProfile({ role: "foreman" });
const sum = (entries, key) => [...entries.values()].reduce((total, entry) => total + entry[key], 0);

describe("foreman pay (engine 2.8.0)", () => {
  it("is 8 h per day worked, whatever the hours entered", () => {
    expect(ENGINE_VERSION).toBe("2.8.0");
    expect(options).toEqual({ flatDayMinutes: FOREMAN_DAY_MINUTES });
    const short = calculatePayrollEntries([job("a", "2026-11-03", "08:00", "11:00")], options);
    const long = calculatePayrollEntries([job("b", "2026-11-03", "06:00", "20:00")], options);
    expect(sum(short, "regularPaidMinutes")).toBe(480);
    expect(sum(long, "totalPaidMinutes")).toBe(480);
    expect(sum(long, "overtime50Minutes") + sum(long, "overtime100Minutes")).toBe(0);
  });

  it("pays a day once when it holds several jobs, and each worked day separately", () => {
    const entries = calculatePayrollEntries([
      job("a", "2026-11-03", "08:00", "10:00"), job("b", "2026-11-03", "10:30", "15:00"),
      job("c", "2026-11-04", "08:00", "12:00"),
    ], options);
    expect(sum(entries, "regularPaidMinutes")).toBe(960);
    expect(entries.get("b").regularPaidMinutes).toBe(0);
  });

  it("leaves every other role untouched", () => {
    expect(overtimeOptionsFromProfile({ role: "employee" }).flatDayMinutes).toBeUndefined();
    const normal = calculatePayrollEntries([job("a", "2026-11-03", "08:00", "11:00")], overtimeOptionsFromProfile({ role: "employee" }));
    expect(sum(normal, "regularPaidMinutes")).toBe(180);
  });
});

describe("migration 0133", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261110120000_0133_foreman_role.sql", import.meta.url), "utf8");
  it("accepts the role, maps it to the employee tier and lets it write its own time", () => {
    expect(sql).toMatch(/role in \('employee', 'foreman', 'subcontractor_1', 'manager', 'admin', 'owner'\)/);
    expect(sql).toMatch(/role in \('admin', 'subcontractor_1', 'foreman'\) then 'employee'/);
    expect(sql).toMatch(/role in \('employee', 'foreman', 'subcontractor_1'\)/);
  });
  it("exempts a foreman from the overtime proof and adds the work-order choice", () => {
    expect(sql).toMatch(/not coalesce\(is_foreman, false\)/);
    expect(sql).toContain("'CONTREMAÎTRE'");
    expect(readFileSync(new URL("./preset-work-orders.js", import.meta.url), "utf8")).toContain('"CONTREMAÎTRE"');
  });
});
