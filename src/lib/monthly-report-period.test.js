import { describe, it, expect } from "vitest";
import { lastSaturdayOfMonth, monthlyReportPeriod } from "./monthly-report-period";

const isoLast = (y, m) => lastSaturdayOfMonth(y, m).toISOString().slice(0, 10);

describe("lastSaturdayOfMonth (2026)", () => {
  it("matches the CCQ 2026 calendar", () => {
    expect(isoLast(2026, 1)).toBe("2026-01-31");
    expect(isoLast(2026, 2)).toBe("2026-02-28");
    expect(isoLast(2026, 3)).toBe("2026-03-28");
    expect(isoLast(2026, 4)).toBe("2026-04-25");
    expect(isoLast(2026, 5)).toBe("2026-05-30");
    expect(isoLast(2026, 6)).toBe("2026-06-27");
    expect(isoLast(2026, 7)).toBe("2026-07-25");
    expect(isoLast(2026, 8)).toBe("2026-08-29");
    expect(isoLast(2026, 9)).toBe("2026-09-26");
    expect(isoLast(2026, 10)).toBe("2026-10-31");
    expect(isoLast(2026, 11)).toBe("2026-11-28");
    expect(isoLast(2026, 12)).toBe("2026-12-26");
  });
});

describe("monthlyReportPeriod", () => {
  it("a date mid-month belongs to that month's period", () => {
    expect(monthlyReportPeriod("2026-03-15")).toEqual({
      key: "2026-03-28",
      start: "2026-03-01",
      end: "2026-03-28",
    });
  });

  it("the last Saturday itself closes its own period", () => {
    expect(monthlyReportPeriod("2026-03-28").end).toBe("2026-03-28");
  });

  it("a date after the last Saturday rolls into the next period", () => {
    // Mar 28 is the last Saturday; Mar 30 belongs to the April period.
    expect(monthlyReportPeriod("2026-03-30")).toEqual({
      key: "2026-04-25",
      start: "2026-03-29",
      end: "2026-04-25",
    });
  });

  it("crosses the year boundary", () => {
    // Dec 26 2026 is the last Saturday; Dec 28 rolls into January 2027.
    const p = monthlyReportPeriod("2026-12-28");
    expect(p.start).toBe("2026-12-27");
    expect(p.end).toBe(lastSaturdayOfMonth(2027, 1).toISOString().slice(0, 10));
  });

  it("returns null for an unparseable date", () => {
    expect(monthlyReportPeriod("")).toBeNull();
    expect(monthlyReportPeriod(null)).toBeNull();
  });
});
