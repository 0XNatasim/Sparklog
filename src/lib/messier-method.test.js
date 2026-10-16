import { describe, expect, it } from "vitest";
import { calculatePayrollEntries } from "./payroll-calculations";

// « Façon Messier » (engine 2.5.1): the return time paid without CCQ benefits becomes regular CCQ
// time up to 8 h in the DAY (owner, 2026-10-16), not up to 40 h in the week.
const totals = (jobs, options) => {
  const sum = { reg: 0, ot50: 0, ot100: 0, retNb: 0 };
  for (const e of calculatePayrollEntries(jobs, options).values()) {
    sum.reg += e.regularWorkMinutes; sum.ot50 += e.overtime50Minutes;
    sum.ot100 += e.overtime100Minutes; sum.retNb += e.returnNoBenefitMinutes;
  }
  return sum;
};

describe("Façon Messier: return time converted up to 8 h per day", () => {
  it("converts the return that fits under 8 h, the rest stays non-CCQ", () => {
    // 7 h of work + 1 h 30 of return (before week 42: no return keeps its benefits by rule).
    const jobs = [{ id: "a", job_date: "2026-09-22", depart: "07:00", fin: "15:30", return_time_minutes: 90 }];
    expect(totals(jobs, { messierMethod: false })).toEqual({ reg: 420, ot50: 0, ot100: 0, retNb: 90 });
    expect(totals(jobs, { messierMethod: true })).toEqual({ reg: 480, ot50: 0, ot100: 0, retNb: 30 });
  });

  it("never converts the return of a day already at 8 h of work, even under 40 h in the week", () => {
    // Anthony, week 42 (Thursday): 8 h 30 of work then 2 h of return; 39 h 30 in the week.
    const jobs = [
      { id: "a", job_date: "2026-10-08", depart: "06:30", fin: "09:52", return_time_minutes: 0 },
      { id: "b", job_date: "2026-10-08", depart: "09:52", fin: "17:00", return_time_minutes: 120 },
    ];
    expect(totals(jobs, { messierMethod: true, firstOtHourDouble: true, returnWithBenefitsTo8h: true }))
      .toEqual(totals(jobs, { messierMethod: false, firstOtHourDouble: true, returnWithBenefitsTo8h: true }));
    expect(totals(jobs, { messierMethod: true, firstOtHourDouble: true }).retNb).toBe(120);
  });

  it("shares the 8 h with the return that already keeps its benefits", () => {
    // Week 42+, return with benefits up to 8 h: nothing left to convert.
    const jobs = [{ id: "a", job_date: "2026-10-06", depart: "07:00", fin: "16:00", return_time_minutes: 120 }];
    expect(totals(jobs, { messierMethod: true, returnWithBenefitsTo8h: true })).toEqual({ reg: 480, ot50: 0, ot100: 0, retNb: 60 });
  });

  it("does not push a later job's work into overtime", () => {
    // Return on the first job, the day's work (8 h) comes after: work takes the 8 h first.
    const jobs = [
      { id: "a", job_date: "2026-09-22", depart: "06:00", fin: "09:00", return_time_minutes: 60 },
      { id: "b", job_date: "2026-09-22", depart: "09:00", fin: "15:00", return_time_minutes: 0 },
    ];
    expect(totals(jobs, { messierMethod: true })).toEqual({ reg: 480, ot50: 0, ot100: 0, retNb: 60 });
  });

  it("keeps Saturday and Sunday returns non-CCQ", () => {
    const jobs = [{ id: "a", job_date: "2026-09-26", depart: "08:00", fin: "12:00", return_time_minutes: 60 }];
    expect(totals(jobs, { messierMethod: true }).retNb).toBe(60);
  });
});
