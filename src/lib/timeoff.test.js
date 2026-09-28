import { describe, it, expect } from "vitest";
import { isOffOn, isExceptionOn, matchesRecurrence } from "./timeoff";

// "Off every Monday" — 2026-09-28 is a Monday, 2026-09-29 a Tuesday.
const everyMonday = { kind: "recurring_weekly", start_date: "2026-01-01", end_date: null, weekdays: [1] };

describe("recurring weekly congé", () => {
  it("is off on the recurring weekday", () => {
    expect(isOffOn(everyMonday, "2026-09-28")).toBe(true);
  });
  it("is not off on a non-recurring weekday", () => {
    expect(isOffOn(everyMonday, "2026-09-29")).toBe(false);
  });
});

describe("recurring weekly exception (worked this particular Monday)", () => {
  const withException = { ...everyMonday, exception_dates: ["2026-09-28"] };

  it("is no longer off on the excepted date", () => {
    expect(isOffOn(withException, "2026-09-28")).toBe(false);
  });
  it("still off on a different Monday", () => {
    expect(isOffOn(withException, "2026-10-05")).toBe(true);
  });
  it("flags the excepted date as an exception", () => {
    expect(isExceptionOn(withException, "2026-09-28")).toBe(true);
    expect(isExceptionOn(withException, "2026-10-05")).toBe(false);
  });
  it("an exception date outside the rule's weekdays is not flagged", () => {
    const wrongDay = { ...everyMonday, exception_dates: ["2026-09-29"] };
    expect(isExceptionOn(wrongDay, "2026-09-29")).toBe(false);
    expect(isOffOn(wrongDay, "2026-09-29")).toBe(false);
  });
});

describe("matchesRecurrence (used to validate a candidate exception date)", () => {
  it("true for a matching weekday within bounds", () => {
    expect(matchesRecurrence(everyMonday, "2026-09-28")).toBe(true);
  });
  it("false for a non-matching weekday", () => {
    expect(matchesRecurrence(everyMonday, "2026-09-29")).toBe(false);
  });
  it("false before the rule's start_date", () => {
    expect(matchesRecurrence({ ...everyMonday, start_date: "2026-10-01" }, "2026-09-28")).toBe(false);
  });
  it("false after the rule's end_date", () => {
    expect(matchesRecurrence({ ...everyMonday, end_date: "2026-09-27" }, "2026-09-28")).toBe(false);
  });
});
