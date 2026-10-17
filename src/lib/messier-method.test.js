import { describe, expect, it } from "vitest";
import { calculatePayrollEntries } from "./payroll-calculations";

// « Façon Messier » (engine 2.6.0): the return time paid without CCQ benefits becomes regular CCQ
// time up to the WEEK's cap — 40 h, minus 8 h per weekday holiday (owner, 2026-10-17: « c'est pour
// la semaine, cette semaine avec un congé donc 32 h max »; 2.5.1 capped it at 8 h per day).
const totals = (jobs, options) => {
  const sum = { reg: 0, ot50: 0, ot100: 0, retNb: 0 };
  for (const e of calculatePayrollEntries(jobs, options).values()) {
    sum.reg += e.regularWorkMinutes; sum.ot50 += e.overtime50Minutes;
    sum.ot100 += e.overtime100Minutes; sum.retNb += e.returnNoBenefitMinutes;
  }
  return sum;
};
const eightHourDays = (dates) => dates.map((d) => ({ id: `w${d}`, job_date: d, depart: "07:00", fin: "15:00", return_time_minutes: 0 }));

describe("Façon Messier: return time converted up to the week's cap", () => {
  it("converts the return that fits under 40 h in the week, the rest stays non-CCQ", () => {
    // Week 40 (before week 42: no return keeps its benefits by rule). Mon–Thu 8 h, Friday 7 h of
    // work + 1 h 30 of return: 39 h of regular work, 1 h left under 40 h.
    const jobs = [...eightHourDays(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]),
      { id: "f", job_date: "2026-09-25", depart: "07:00", fin: "15:30", return_time_minutes: 90 }];
    expect(totals(jobs, { messierMethod: false })).toEqual({ reg: 2340, ot50: 0, ot100: 0, retNb: 90 });
    expect(totals(jobs, { messierMethod: true })).toEqual({ reg: 2400, ot50: 0, ot100: 0, retNb: 30 });
  });

  it("converts the return of a day already at 8 h of work while the week is under 40 h", () => {
    // Anthony, week 42 (Thursday): 8 h 30 of work then 2 h of return, alone in the week.
    const jobs = [
      { id: "a", job_date: "2026-10-08", depart: "06:30", fin: "09:52", return_time_minutes: 0 },
      { id: "b", job_date: "2026-10-08", depart: "09:52", fin: "17:00", return_time_minutes: 120 },
    ];
    expect(totals(jobs, { messierMethod: true, firstOtHourDouble: true })).toEqual({ reg: 600, ot50: 0, ot100: 30, retNb: 0 });
    expect(totals(jobs, { messierMethod: false, firstOtHourDouble: true }).retNb).toBe(120);
  });

  it("the week's regular work takes the cap first, even when the return comes earlier in the week", () => {
    // Monday: 6 h work + 2 h return; Tue–Fri 8 h: 38 h of work, 2 h of room → the Monday return fits.
    // One more hour of work on Friday (overtime) does not use the cap.
    const monday = { id: "m", job_date: "2026-09-21", depart: "07:00", fin: "15:00", return_time_minutes: 120 };
    const jobs = [monday, ...eightHourDays(["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"])];
    expect(totals(jobs, { messierMethod: true }).retNb).toBe(0);
    // Monday at 8 h of work + 2 h of return: 40 h of work, no room left.
    const full = [{ ...monday, fin: "17:00" }, ...eightHourDays(["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"])];
    expect(totals(full, { messierMethod: true })).toEqual({ reg: 2400, ot50: 0, ot100: 0, retNb: 120 });
  });

  it("shares the week's cap with the return that already keeps its benefits", () => {
    // Week 42+, return with benefits: Mon–Thu 8 h, Friday 7 h + 2 h of return → 1 h with benefits,
    // nothing left to convert.
    const jobs = [...eightHourDays(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]),
      { id: "f", job_date: "2026-10-09", depart: "07:00", fin: "16:00", return_time_minutes: 120 }];
    expect(totals(jobs, { messierMethod: true, returnWithBenefitsTo8h: true })).toEqual({ reg: 2400, ot50: 0, ot100: 0, retNb: 60 });
  });

  it("a weekday holiday lowers the cap to 32 h (Thanksgiving 2026)", () => {
    // Monday 2026-10-12 is a holiday: Tue–Fri 8 h of work = 32 h, the Tuesday return has no room.
    const jobs = [...eightHourDays(["2026-10-14", "2026-10-15", "2026-10-16"]),
      { id: "t", job_date: "2026-10-13", depart: "07:00", fin: "16:00", return_time_minutes: 60 }];
    expect(totals(jobs, { messierMethod: true, holidayDates: ["2026-10-12"] }).retNb).toBe(60);
    expect(totals(jobs, { messierMethod: true }).retNb).toBe(0); // same week without the holiday: 40 h
  });

  it("does not push a later job's work into overtime", () => {
    // Return on the first job, the day's work (8 h) comes after: work stays regular, the return
    // fits under the week's cap.
    const jobs = [
      { id: "a", job_date: "2026-09-22", depart: "06:00", fin: "09:00", return_time_minutes: 60 },
      { id: "b", job_date: "2026-09-22", depart: "09:00", fin: "15:00", return_time_minutes: 0 },
    ];
    expect(totals(jobs, { messierMethod: true })).toEqual({ reg: 540, ot50: 0, ot100: 0, retNb: 0 });
  });

  it("keeps Saturday and Sunday returns non-CCQ", () => {
    const jobs = [{ id: "a", job_date: "2026-09-26", depart: "08:00", fin: "12:00", return_time_minutes: 60 }];
    expect(totals(jobs, { messierMethod: true }).retNb).toBe(60);
  });
});
