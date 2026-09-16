import { describe, it, expect } from "vitest";
import { ccqWeekInfo, ccqWeekNumber, weekEndingSaturdayD, weekStartSundayD } from "./ccq-week";

describe("CCQ pay week (Sunday → Saturday)", () => {
  it("ends the week on the containing Saturday", () => {
    expect(weekEndingSaturdayD("2026-08-30").format("YYYY-MM-DD")).toBe("2026-09-05"); // Sunday → its Saturday
    expect(weekEndingSaturdayD("2026-09-05").format("YYYY-MM-DD")).toBe("2026-09-05"); // Saturday → itself
    expect(weekEndingSaturdayD("2026-09-02").format("YYYY-MM-DD")).toBe("2026-09-05"); // mid-week
  });
  it("starts the week on the containing Sunday", () => {
    expect(weekStartSundayD("2026-09-05").format("YYYY-MM-DD")).toBe("2026-08-30");
    expect(weekStartSundayD("2026-08-30").format("YYYY-MM-DD")).toBe("2026-08-30");
  });
});

describe("CCQ week numbering (week 1 ends the last Saturday of the previous December)", () => {
  it("reproduces the D0033-0007 stub: 2026-08-30 → 09-05 is week 37", () => {
    expect(ccqWeekNumber("2026-08-30")).toBe(37);
    expect(ccqWeekNumber("2026-09-05")).toBe(37);
    expect(ccqWeekInfo("2026-09-05")).toEqual({ weekNo: 37, ccqYear: 2026 });
  });
  it("puts week 1 of 2026 on Sun 2025-12-21 → Sat 2025-12-27", () => {
    expect(ccqWeekInfo("2025-12-27")).toEqual({ weekNo: 1, ccqYear: 2026 });
    expect(ccqWeekInfo("2025-12-21")).toEqual({ weekNo: 1, ccqYear: 2026 });
  });
  it("numbers the following weeks consecutively", () => {
    expect(ccqWeekInfo("2026-01-03")).toEqual({ weekNo: 2, ccqYear: 2026 });
    expect(ccqWeekNumber("2026-01-10")).toBe(3);
  });
  it("rolls late-December weeks into the next CCQ year", () => {
    // Sat 2026-12-26 is the last Saturday of 2026 → week 1 of CCQ year 2027.
    expect(ccqWeekInfo("2026-12-26")).toEqual({ weekNo: 1, ccqYear: 2027 });
  });
});
