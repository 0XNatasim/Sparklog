import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, FOREMAN_DAY_MINUTES, calculatePayrollEntries, overtimeOptionsFromProfile } from "./payroll-calculations";

const job = (id, date, depart, fin, extra = {}) => ({ id, job_date: date, depart, arrivee: depart, fin, km_aller: 10, ...extra });
const options = overtimeOptionsFromProfile({ role: "foreman" });
const sum = (entries, key) => [...entries.values()].reduce((total, entry) => total + entry[key], 0);

describe("foreman pay (engine 2.8.0)", () => {
  it("pays at least 8 h for a weekday worked", () => {
    expect(ENGINE_VERSION).toBe("2.8.0");
    expect(options).toMatchObject({ minDayMinutes: FOREMAN_DAY_MINUTES, noReturn: true });
    const short = calculatePayrollEntries([job("a", "2026-11-03", "08:00", "11:00")], options);
    expect(sum(short, "regularPaidMinutes")).toBe(480);
    expect(sum(short, "totalPaidMinutes")).toBe(480);
  });

  it("pays a short day once even with several jobs, topped up on the first job", () => {
    const entries = calculatePayrollEntries([
      job("a", "2026-11-03", "08:00", "10:00"), job("b", "2026-11-03", "10:30", "13:00"),
    ], options);
    expect(sum(entries, "totalPaidMinutes")).toBe(480);
    expect(entries.get("a").regularPaidMinutes).toBe(480 - 150);
  });

  it("keeps the overtime beyond 8 h like any employee", () => {
    const foreman = calculatePayrollEntries([job("a", "2026-11-03", "06:00", "17:00")], options);
    const plain = calculatePayrollEntries([job("a", "2026-11-03", "06:00", "17:00")], overtimeOptionsFromProfile({ role: "employee" }));
    expect(sum(foreman, "regularPaidMinutes")).toBe(480);
    expect(sum(foreman, "overtime50Minutes")).toBe(60);
    expect(sum(foreman, "overtime100Minutes")).toBe(120);
    expect(sum(foreman, "totalPaidMinutes")).toBe(sum(plain, "totalPaidMinutes"));
  });

  it("has no return time and no unpaid first trip", () => {
    const day = [job("a", "2026-11-03", "08:00", "12:00", { return_time_minutes: 60 })];
    const foreman = calculatePayrollEntries(day, { ...options, firstTripUnpaid: true });
    expect(sum(foreman, "returnNoBenefitMinutes")).toBe(0);
    const plain = calculatePayrollEntries(day, overtimeOptionsFromProfile({ role: "employee" }));
    expect(sum(plain, "returnNoBenefitMinutes")).toBe(60);
  });

  it("gives no top-up on a Saturday and leaves other roles untouched", () => {
    const saturday = calculatePayrollEntries([job("a", "2026-11-07", "08:00", "11:00")], options);
    expect(sum(saturday, "totalPaidMinutes")).toBe(180);
    expect(overtimeOptionsFromProfile({ role: "employee" }).minDayMinutes).toBeUndefined();
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
  it("keeps the overtime proof for a foreman and adds the work-order choice", () => {
    expect(sql).not.toContain("is_foreman");
    expect(sql).toContain("'CONTREMAÎTRE'");
    expect(readFileSync(new URL("./preset-work-orders.js", import.meta.url), "utf8")).toContain('"CONTREMAÎTRE"');
  });
});
