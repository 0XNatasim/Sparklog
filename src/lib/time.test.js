import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { hoursBetween } from "./time";

describe("hoursBetween", () => {
  it("computes a same-day span", () => {
    expect(hoursBetween(dayjs("2026-09-09T08:00"), dayjs("2026-09-09T16:00"))).toBe(8);
  });

  it("uses the payroll overnight convention when the end time is earlier", () => {
    expect(hoursBetween(dayjs("2026-09-09T22:00"), dayjs("2026-09-09T06:00"))).toBe(8);
  });

  it("returns zero for equal times", () => {
    expect(hoursBetween(dayjs("2026-09-09T08:00"), dayjs("2026-09-09T08:00"))).toBe(0);
  });

  it("returns zero for missing or invalid values", () => {
    expect(hoursBetween(null, dayjs("2026-09-09T08:00"))).toBe(0);
    expect(hoursBetween(dayjs("invalid"), dayjs("2026-09-09T08:00"))).toBe(0);
  });
});
