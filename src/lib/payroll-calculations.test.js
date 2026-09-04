import { describe, it, expect } from "vitest";
import { minutesBetween, calculatePayrollEntries, isMealEligible, roundHours } from "./payroll-calculations";

// Single-job helper: returns the payroll entry for one job worked from 08:00.
function entry(fin, extra = {}) {
  const job = { id: "j1", job_date: "2026-06-01", depart: "08:00", fin, return_time_minutes: 0, ...extra };
  return calculatePayrollEntries([job]).get("j1");
}

describe("minutesBetween", () => {
  it("computes a same-day span", () => expect(minutesBetween("08:00", "16:00")).toBe(480));
  it("handles an overnight span", () => expect(minutesBetween("22:00", "06:00")).toBe(480));
  it("returns 0 when a time is missing", () => expect(minutesBetween("", "16:00")).toBe(0));
});

describe("daily overtime boundary (8h/day)", () => {
  it("7h59 → no overtime", () => {
    const e = entry("15:59");
    expect(e.regularWorkMinutes).toBe(479);
    expect(e.overtimeWorkMinutes).toBe(0);
  });
  it("8h00 exactly → no overtime", () => {
    const e = entry("16:00");
    expect(e.regularWorkMinutes).toBe(480);
    expect(e.overtimeWorkMinutes).toBe(0);
  });
  it("8h01 → 1 min at time-and-a-half", () => {
    const e = entry("16:01");
    expect(e.regularWorkMinutes).toBe(480);
    expect(e.overtime50Minutes).toBe(1);
    expect(e.overtime100Minutes).toBe(0);
  });
});

describe("overtime 50%/100% split", () => {
  it("10h → 8h regular, 1h @50%, 1h @100%", () => {
    const e = entry("18:00");
    expect(e.regularWorkMinutes).toBe(480);
    expect(e.overtime50Minutes).toBe(60);
    expect(e.overtime100Minutes).toBe(60);
  });
  it("accumulates across two jobs on the same day (5h + 5h)", () => {
    const jobs = [
      { id: "a", job_date: "2026-06-01", depart: "08:00", fin: "13:00", return_time_minutes: 0 },
      { id: "b", job_date: "2026-06-01", depart: "13:00", fin: "18:00", return_time_minutes: 0 },
    ];
    const entries = calculatePayrollEntries(jobs);
    const b = entries.get("b");
    expect(b.regularWorkMinutes).toBe(180); // fills the day to 8h
    expect(b.overtime50Minutes).toBe(60);
    expect(b.overtime100Minutes).toBe(60);
  });
});

describe("weekly overtime split (M1 golden fixtures — 1.5x allowance is per WEEK)", () => {
  // Week of Mon 2026-06-01 .. Fri 2026-06-05 (no weekend work).
  const week = (days) => {
    const jobs = days.map(([date, fin], i) => ({ id: `j${i}`, job_date: date, depart: "08:00", fin, return_time_minutes: 0 }));
    const entries = [...calculatePayrollEntries(jobs).values()];
    const sum = (k) => entries.reduce((t, e) => t + e[k], 0);
    return { reg: sum("regularWorkMinutes"), ot50: sum("overtime50Minutes"), ot100: sum("overtime100Minutes") };
  };

  it("9h each day Mon–Fri (45h) → 40h reg, 1h @1.5x, 4h @2x", () => {
    const r = week([["2026-06-01", "17:00"], ["2026-06-02", "17:00"], ["2026-06-03", "17:00"], ["2026-06-04", "17:00"], ["2026-06-05", "17:00"]]);
    expect(r.reg).toBe(2400);   // 40h
    expect(r.ot50).toBe(60);    // 1h — only the first OT hour of the WEEK
    expect(r.ot100).toBe(240);  // 4h
  });

  it("12h Mon then 6h Tue–Fri (36h) → 32h reg, 1h @1.5x, 3h @2x", () => {
    const r = week([["2026-06-01", "20:00"], ["2026-06-02", "14:00"], ["2026-06-03", "14:00"], ["2026-06-04", "14:00"], ["2026-06-05", "14:00"]]);
    expect(r.reg).toBe(1920);   // 32h
    expect(r.ot50).toBe(60);    // 1h
    expect(r.ot100).toBe(180);  // 3h
  });

  it("the 1.5x allowance resets each week", () => {
    // 9h on Mon of two different weeks → each week gets its own first-hour @1.5x.
    const r = week([["2026-06-01", "17:00"], ["2026-06-08", "17:00"]]);
    expect(r.ot50).toBe(120);   // 60 + 60
    expect(r.ot100).toBe(0);
  });

  it("conserves every minute (reg + ot50 + ot100 = worked)", () => {
    const jobs = [
      { id: "a", job_date: "2026-06-01", depart: "08:00", fin: "20:00", return_time_minutes: 0 },
      { id: "b", job_date: "2026-06-02", depart: "08:00", fin: "17:00", return_time_minutes: 0 },
    ];
    let worked = 0, split = 0;
    for (const e of calculatePayrollEntries(jobs).values()) {
      worked += e.overtimeWorkMinutes + e.regularWorkMinutes;
      split += e.regularWorkMinutes + e.overtime50Minutes + e.overtime100Minutes;
    }
    expect(split).toBe(worked);
  });
});

describe("return-to-storage time", () => {
  it("never creates overtime and is paid at the regular rate", () => {
    const e = entry("16:00", { return_time_minutes: 60 });
    expect(e.overtimeWorkMinutes).toBe(0);
    expect(e.returnRegularMinutes).toBe(60);
    expect(e.regularPaidMinutes).toBe(540);
  });
});

describe("isMealEligible (supper: >8h + 2h15 = 615 min, weekday only)", () => {
  it("614 min → not eligible", () => expect(isMealEligible({ jobDate: "2026-06-01", dailyWorkMinutes: 614 })).toBe(false));
  it("615 min on a weekday → eligible", () => expect(isMealEligible({ jobDate: "2026-06-01", dailyWorkMinutes: 615 })).toBe(true));
  it("never eligible on a Saturday", () => expect(isMealEligible({ jobDate: "2026-06-06", dailyWorkMinutes: 700 })).toBe(false));
});

describe("roundHours", () => {
  it("converts minutes to 2-decimal hours", () => {
    expect(roundHours(90)).toBe(1.5);
    expect(roundHours(485)).toBe(8.08);
  });
});
