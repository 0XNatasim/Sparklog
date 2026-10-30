import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isNonWorkday, isWeekendDate, lookbackWorkdays } from "./workdays";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("work days", () => {
  it("are Monday to Friday minus the CCQ holidays", () => {
    expect(isWeekendDate("2026-10-17")).toBe(true); // Saturday
    expect(isWeekendDate("2026-10-18")).toBe(true); // Sunday
    expect(isNonWorkday("2026-10-12")).toBe(false);
    expect(isNonWorkday("2026-10-12", ["2026-10-12"])).toBe(true);
    expect(isNonWorkday("2026-10-12", new Set(["2026-10-12"]))).toBe(true);
    expect(isNonWorkday("2026-10-13", ["2026-10-12"])).toBe(false);
  });

  it("are what every « not submitted » screen uses", () => {
    expect(read("../components/LiveCrew.jsx")).toContain("isNonWorkday(yesterday, holidays) ? []");
    expect(read("../components/manager/TodoInbox.jsx")).toContain("lookbackWorkdays(today, await loadHolidayDates())");
    expect(read("../components/WeekSnapshot.jsx")).toContain("if (cell.holiday) return");
  });
});

describe("lookbackWorkdays", () => {
  it("starts with the previous work day and goes back to this week's Monday", () => {
    expect(lookbackWorkdays("2026-10-30")).toEqual(["2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26"]); // Friday
    expect(lookbackWorkdays("2026-10-28")).toEqual(["2026-10-27", "2026-10-26"]); // Wednesday
    expect(lookbackWorkdays("2026-10-27")).toEqual(["2026-10-26"]); // Tuesday: yesterday only
  });

  it("is only the previous Friday on a Monday, as before", () => {
    expect(lookbackWorkdays("2026-10-26")).toEqual(["2026-10-23"]);
  });

  it("skips a holiday inside the week", () => {
    expect(lookbackWorkdays("2026-10-30", ["2026-10-28"])).toEqual(["2026-10-29", "2026-10-27", "2026-10-26"]);
  });
});
