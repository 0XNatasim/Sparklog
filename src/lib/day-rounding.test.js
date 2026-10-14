import { describe, expect, it } from "vitest";
import { DAY_ROUNDING, buildDayRounding, calculateDailyTotals, calculatePayrollEntries, roundToStep } from "./payroll-calculations";

const job = (id, job_date, depart, fin, extra = {}) => ({ id, job_date, depart, arrivee: depart, fin, ...extra });
// Mon 2026-10-05 … Fri 2026-10-09 (after the 2026-10-04 start, CCQ week 42)
const MON = "2026-10-05", TUE = "2026-10-06", WED = "2026-10-07";

describe("roundToStep", () => {
  it("rounds to the nearest 15 minutes: up to 7 down, 8 and more up", () => {
    expect(roundToStep(487)).toBe(480); // 8h07
    expect(roundToStep(488)).toBe(495); // 8h08
    expect(roundToStep(480)).toBe(480);
    expect(roundToStep(473)).toBe(480); // 7h53
  });
});

describe("buildDayRounding — the owner's example", () => {
  it("Mon 8h07 → 8h00 (counter −7), Tue 7h53 → 8h00 (counter 0)", () => {
    const r = buildDayRounding([job("m", MON, "07:00", "15:07"), job("t", TUE, "07:00", "14:53")]);
    expect(r.days.map(({ date, worked, paid, delta, balanceAfter }) => ({ date, worked, paid, delta, balanceAfter }))).toEqual([
      { date: MON, worked: 487, paid: 480, delta: -7, balanceAfter: -7 },
      { date: TUE, worked: 473, paid: 480, delta: 7, balanceAfter: 0 },
    ]);
    expect(r.balanceBefore(TUE)).toBe(-7);
    expect(r.balanceAfter(WED)).toBe(0);
  });

  it("8h08 → 8h15, the employer paid 7 minutes more (+7)", () => {
    const r = buildDayRounding([job("m", MON, "07:00", "15:08")]);
    expect(r.days[0]).toMatchObject({ paid: 495, delta: 7, balanceAfter: 7 });
  });

  it("keeps the counter within ±7 minutes and never loses a minute over time", () => {
    const days = [];
    for (let d = 0; d < 40; d += 1) {
      const date = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10);
      days.push(job(`j${d}`, date, "07:00", `15:${String((d * 7) % 60).padStart(2, "0")}`));
    }
    const r = buildDayRounding(days);
    for (const day of r.days) {
      expect(Math.abs(day.balanceAfter)).toBeLessThanOrEqual(7);
      expect(day.paid % 15).toBe(0);
    }
    const worked = r.days.reduce((s, d) => s + d.worked, 0);
    const paid = r.days.reduce((s, d) => s + d.paid, 0);
    expect(paid - worked).toBe(r.days.at(-1).balanceAfter);
  });

  it("starts on 2026-10-04 (week 42): earlier days are paid to the minute", () => {
    expect(DAY_ROUNDING.startDate).toBe("2026-10-04");
    const r = buildDayRounding([job("old", "2026-10-02", "07:00", "15:07"), job("m", MON, "07:00", "15:07")]);
    expect(r.days.map((d) => d.date)).toEqual([MON]);
  });
});

describe("calculatePayrollEntries with rounding", () => {
  it("takes the 7 minutes off the end of the day (overtime past 8 h)", () => {
    const jobs = [job("m1", MON, "07:00", "12:00"), job("m2", MON, "12:00", "15:07")];
    const rounding = buildDayRounding(jobs);
    const day = calculateDailyTotals(jobs, { rounding }).get(MON);
    expect(day.totalPaidMinutes).toBe(480);
    expect(day.regularWorkMinutes).toBe(480);
    expect(day.overtime50Minutes + day.overtime100Minutes).toBe(0);
    expect(day.roundingMinutes).toBe(-7);
    const entries = calculatePayrollEntries(jobs, { rounding });
    expect(entries.get("m2").roundingMinutes).toBe(-7); // the last job of the day
    expect(entries.get("m1").roundingMinutes).toBe(0);
  });

  it("adds the minutes as overtime when the day is over 8 h, carried from the day before", () => {
    const jobs = [job("m", MON, "07:00", "15:07"), job("t", TUE, "07:00", "15:01")];
    const rounding = buildDayRounding(jobs);
    const tue = calculateDailyTotals(jobs, { rounding }).get(TUE);
    // 8h01 + 7 owed = 8h08 → 8h15: 15 minutes of overtime, counter +7
    expect(tue.totalPaidMinutes).toBe(495);
    expect(tue.regularWorkMinutes).toBe(480);
    expect(tue.overtime50Minutes + tue.overtime100Minutes).toBe(15);
    expect(rounding.balanceAfter(TUE)).toBe(7);
  });

  it("with return time, the rounding goes to the return (8h37 with 30 min return → return 23 min)", () => {
    const jobs = [job("m", MON, "07:00", "15:37", { return_time_minutes: 30 })]; // 8h07 work + 30 return
    const rounding = buildDayRounding(jobs);
    const day = calculateDailyTotals(jobs, { rounding }).get(MON);
    expect(day.totalPaidMinutes).toBe(510); // 8h30
    expect(day.returnNoBenefitMinutes).toBe(23);
    expect(day.regularWorkMinutes).toBe(480);
    expect(day.overtime50Minutes + day.overtime100Minutes).toBe(7); // the work is untouched
    expect(day.roundingMinutes).toBe(-7);
  });

  it("adds rounding minutes to the return time too", () => {
    const jobs = [job("m", MON, "07:00", "15:38", { return_time_minutes: 30 })]; // 8h38 → 8h45
    const day = calculateDailyTotals(jobs, { rounding: buildDayRounding(jobs) }).get(MON);
    expect(day.totalPaidMinutes).toBe(525);
    expect(day.returnNoBenefitMinutes).toBe(37);
    expect(day.overtime50Minutes + day.overtime100Minutes).toBe(8);
  });

  it("takes the rest from the end of the work when the return is shorter", () => {
    // Tue: 7h53 owed 7 → … build a −14 case: counter +7 then 8h07 with a 5-minute return
    const jobs = [job("m", MON, "07:00", "15:08"), job("t", TUE, "07:00", "15:07", { return_time_minutes: 5 })];
    const rounding = buildDayRounding(jobs);
    expect(rounding.balanceBefore(TUE)).toBe(7);
    const tue = calculateDailyTotals(jobs, { rounding }).get(TUE);
    // 8h07 − 7 = 8h00 → paid 8h00: −7 = 5 from the return, 2 from the work
    expect(tue.totalPaidMinutes).toBe(480);
    expect(tue.returnNoBenefitMinutes).toBe(0);
    expect(tue.regularWorkMinutes + tue.overtime50Minutes + tue.overtime100Minutes).toBe(480);
  });

  it("changes nothing without the option (unrounded callers keep their numbers)", () => {
    const jobs = [job("m", MON, "07:00", "15:07")];
    expect(calculateDailyTotals(jobs, {}).get(MON).totalPaidMinutes).toBe(487);
  });
});
