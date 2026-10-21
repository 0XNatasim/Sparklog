import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isOffOn, isExceptionOn, matchesRecurrence, sickLeaveRegister, sickLeaveYears, TIME_OFF_CATEGORIES } from "./timeoff";

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

describe("sick-leave register (« Maladie », 0106)", () => {
  const A = "user-a";
  const B = "user-b";
  const rows = [
    // Friday 9 → Tuesday 13 October 2026: Fri, Mon (Thanksgiving), Tue.
    { id: 1, user_id: A, category: "maladie", kind: "range", start_date: "2026-10-09", end_date: "2026-10-13", note: "grippe" },
    // Part of a day: 3 h 30.
    { id: 2, user_id: A, category: "maladie", kind: "range", start_date: "2026-10-07", end_date: "2026-10-07", start_time: "08:00:00", end_time: "11:30:00" },
    // Crosses the new year: Wed 30 and Thu 31 Dec 2026, then Fri 1, Mon 4, Tue 5 Jan 2027.
    { id: 3, user_id: B, category: "maladie", kind: "range", start_date: "2026-12-30", end_date: "2027-01-05" },
    // One whole day (no times): Monday 2 March 2026.
    { id: 6, user_id: B, category: "maladie", kind: "range", start_date: "2026-03-02", end_date: "2026-03-02", start_time: null, end_time: null },
    // Not sick leave.
    { id: 4, user_id: B, category: "vacances", kind: "range", start_date: "2026-07-20", end_date: "2026-07-24" },
    { id: 5, user_id: B, category: "maladie", kind: "recurring_weekly", start_date: "2026-01-01", weekdays: [1] },
  ];

  it("counts work days without weekends and holidays, and partial days in hours", () => {
    const [a] = sickLeaveRegister(rows, { year: 2026, holidays: ["2026-10-12"] }).filter((l) => l.userId === A);
    expect(a.occurrences).toBe(2);
    expect(a.days).toBe(2);
    expect(a.hours).toBe(3.5);
    expect(a.entries.map((e) => e.id)).toEqual([2, 1]);
    expect(a.entries[1].note).toBe("grippe");
  });

  it("counts a holiday as a work day when it is not in the list", () => {
    const [a] = sickLeaveRegister(rows, { year: 2026 }).filter((l) => l.userId === A);
    expect(a.days).toBe(3);
  });

  it("counts a whole single day (no times) as one work day", () => {
    const b = sickLeaveRegister(rows, { year: 2026 }).find((l) => l.userId === B);
    expect(b.entries[0]).toMatchObject({ id: 6, days: 1, hours: 0 });
  });

  it("splits a range across the new year and ignores other categories and recurring rules", () => {
    const b2026 = sickLeaveRegister(rows, { year: 2026 }).find((l) => l.userId === B);
    const b2027 = sickLeaveRegister(rows, { year: 2027 }).find((l) => l.userId === B);
    expect(b2026).toMatchObject({ occurrences: 2, days: 3, hours: 0 });
    expect(b2027).toMatchObject({ occurrences: 1, days: 3, hours: 0 });
    expect(sickLeaveRegister(rows, { year: 2025 })).toEqual([]);
  });

  it("offers every year with sick leave plus the current year, newest first", () => {
    expect(sickLeaveYears(rows, 2026)).toEqual([2027, 2026]);
    expect(sickLeaveYears([], 2026)).toEqual([2026]);
  });

  it("« maladie » is a category in the app and in the database constraint", () => {
    expect(TIME_OFF_CATEGORIES).toContain("maladie");
    const sql = readFileSync(new URL("../../supabase/migrations/20261021160000_0106_time_off_sick_leave.sql", import.meta.url), "utf8");
    for (const category of TIME_OFF_CATEGORIES) expect(sql).toContain(`'${category}'`);
  });
});
