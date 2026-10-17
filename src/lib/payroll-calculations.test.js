import { describe, it, expect } from "vitest";
import { minutesBetween, calculatePayrollEntries, isMealEligible, roundHours, calculateCongesIndemnity, computeWeek, ENGINE_VERSION, RETURN_WITH_BENEFITS, WEEK_REGULAR_CAP_MINUTES } from "./payroll-calculations";

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
  it("firstOtHourDouble: no 1.5x tier — all overtime is 2x", () => {
    const job = { id: "j1", job_date: "2026-06-01", depart: "08:00", fin: "18:00", return_time_minutes: 0 };
    const e = calculatePayrollEntries([job], { firstOtHourDouble: true }).get("j1");
    expect(e.regularWorkMinutes).toBe(480);
    expect(e.overtime50Minutes).toBe(0);
    expect(e.overtime100Minutes).toBe(120);
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
  it("is NOT paid separately (already inside Départ→Fin) — return_time_minutes never adds to pay", () => {
    const e = entry("16:00", { return_time_minutes: 60 });
    expect(e.overtimeWorkMinutes).toBe(0);
    // Return minutes are not paid again: the drive back is already logged within the job span.
    expect(e.returnRegularMinutes).toBe(0);
    expect(e.totalPaidMinutes).toBe(480);
    expect(e.regularWorkMinutes + e.returnNoBenefitMinutes).toBe(480);
  });
});

// Messier rule (owner decision 2026-10-13): return time is never overtime and is left out of
// the 8h split. Default: paid at the base rate without benefits. With returnWithBenefitsTo8h:
// with benefits while work + return stays within 8h, without benefits beyond — from CCQ week 42
// (2026-10-04); earlier days keep the default.
describe("return-to-warehouse time: never overtime, benefits up to the week's cap when checked", () => {
  const day = (fin, ret, extra = {}) => ({ id: "j1", job_date: "2026-10-05", depart: "07:00", fin, return_time_minutes: ret, ...extra });
  const run = (jobs, options) => [...calculatePayrollEntries(jobs, options).values()];
  const sum = (entries, key) => entries.reduce((t, e) => t + e[key], 0);
  // Mon–Thu of week 42 at 8 h of work each (32 h); Friday is 2026-10-09.
  const fourFullDays = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]
    .map((d) => ({ id: `w${d}`, job_date: d, depart: "07:00", fin: "15:00", return_time_minutes: 0 }));

  it.each([
    // [label, fin, return, default (reg / no-benefit), checked (reg / no-benefit)] — alone in the week.
    ["6h30 job + 1h return (7h30)", "14:30", 60, [390, 60], [450, 0]],
    ["6h30 job + 2h return (8h30)", "15:30", 120, [390, 120], [510, 0]],
    ["8h job + 1h return (9h): over 8 h in the day, still under 40 h in the week", "16:00", 60, [480, 60], [540, 0]],
  ])("%s", (_, fin, ret, [defReg, defNb], [chkReg, chkNb]) => {
    const def = calculatePayrollEntries([day(fin, ret)]).get("j1");
    expect([def.regularWorkMinutes, def.returnNoBenefitMinutes, def.overtimeWorkMinutes]).toEqual([defReg, defNb, 0]);
    const chk = calculatePayrollEntries([day(fin, ret)], { returnWithBenefitsTo8h: true }).get("j1");
    expect([chk.regularWorkMinutes, chk.returnNoBenefitMinutes, chk.overtimeWorkMinutes]).toEqual([chkReg, chkNb, 0]);
    expect(def.totalPaidMinutes).toBe(chk.totalPaidMinutes); // same minutes, only recategorised
  });

  it("work over 8h is still overtime; the return on top never is", () => {
    // 9h job + 1h return: 8h regular + 1h overtime (work) + 1h return with benefits (week under 40 h).
    const e = calculatePayrollEntries([day("17:00", 60)], { returnWithBenefitsTo8h: true }).get("j1");
    expect(e.regularWorkMinutes).toBe(540);
    expect(e.overtimeWorkMinutes).toBe(60);
    expect(e.returnNoBenefitMinutes).toBe(0);
  });

  it("only the part of the return that fits under 40 h in the week keeps its benefits", () => {
    // 32 h Mon–Thu + Friday 7h work + 2h return: 1 h of room.
    const friday = { id: "f", job_date: "2026-10-09", depart: "07:00", fin: "16:00", return_time_minutes: 120 };
    const e = calculatePayrollEntries([...fourFullDays, friday], { returnWithBenefitsTo8h: true }).get("f");
    expect([e.regularWorkMinutes, e.returnNoBenefitMinutes, e.overtimeWorkMinutes]).toEqual([480, 60, 0]);
  });

  it("the week's work takes the cap first, even when the return is logged earlier in the week", () => {
    // Monday's return comes before Friday's 8 h of work: 40 h of work leave no room for it.
    const monday = { ...fourFullDays[0], fin: "17:00", return_time_minutes: 120 }; // 8h work + 2h return
    const friday = { id: "f", job_date: "2026-10-09", depart: "07:00", fin: "15:00", return_time_minutes: 0 };
    const entries = run([monday, ...fourFullDays.slice(1), friday], { returnWithBenefitsTo8h: true });
    expect(sum(entries, "regularWorkMinutes")).toBe(2400);
    expect(sum(entries, "returnNoBenefitMinutes")).toBe(120);
    expect(sum(entries, "overtimeWorkMinutes")).toBe(0);
  });

  it("the room is filled in date order when several returns compete", () => {
    // Mon–Thu 8h work (Monday with 1h of return), Friday 7h work + 1h return: 1 h of room → Monday.
    const monday = { ...fourFullDays[0], fin: "16:00", return_time_minutes: 60 };
    const friday = { id: "f", job_date: "2026-10-09", depart: "07:00", fin: "15:00", return_time_minutes: 60 };
    const m = calculatePayrollEntries([monday, ...fourFullDays.slice(1), friday], { returnWithBenefitsTo8h: true });
    expect(m.get(monday.id).returnNoBenefitMinutes).toBe(0);
    expect(m.get("f").returnNoBenefitMinutes).toBe(60);
  });

  it("a weekday holiday lowers the week's cap by 8 h (Thanksgiving 2026: 32 h)", () => {
    // Monday 2026-10-12 off; Tue–Fri 8h of work, Friday + 1h of return.
    const days = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]
      .map((d) => ({ id: d, job_date: d, depart: "07:00", fin: d === "2026-10-16" ? "16:00" : "15:00", return_time_minutes: d === "2026-10-16" ? 60 : 0 }));
    const withHoliday = calculatePayrollEntries(days, { returnWithBenefitsTo8h: true, holidayDates: ["2026-10-12"] }).get("2026-10-16");
    expect(withHoliday.returnNoBenefitMinutes).toBe(60);
    const without = calculatePayrollEntries(days, { returnWithBenefitsTo8h: true }).get("2026-10-16");
    expect(without.returnNoBenefitMinutes).toBe(0);
    expect(WEEK_REGULAR_CAP_MINUTES).toBe(2400);
  });

  it("applies from week 42 (2026-10-04): an earlier day keeps the return without benefits", () => {
    const at = (date) => calculatePayrollEntries([day("14:30", 60, { job_date: date })], { returnWithBenefitsTo8h: true }).get("j1");
    expect([at("2026-10-02").regularWorkMinutes, at("2026-10-02").returnNoBenefitMinutes]).toEqual([390, 60]); // Fri, week 41
    expect([at("2026-10-05").regularWorkMinutes, at("2026-10-05").returnNoBenefitMinutes]).toEqual([450, 0]); // Mon, week 42
    expect(RETURN_WITH_BENEFITS.startDate).toBe("2026-10-04");
  });

  it("an unpaid first trip is removed before the week's room is measured", () => {
    // 07:00→07:30 unpaid trip, then 6h work + 2h return (span 07:00→15:30).
    const job = day("15:30", 120, { arrivee: "07:30" });
    const e = calculatePayrollEntries([job], { returnWithBenefitsTo8h: true, firstTripUnpaid: true }).get("j1");
    expect(e.regularWorkMinutes).toBe(480); // 6h work + 2h return with benefits
    expect(e.returnNoBenefitMinutes).toBe(0);
    expect(e.totalPaidMinutes).toBe(480);
  });
});


// Convention ICI 21.01 / 21.02 b) (owner decision 2026-10-13).
describe("Saturday, Sunday and statutory holidays", () => {
  const job = (id, date, fin, extra = {}) => ({ id, job_date: date, depart: "08:00", fin, return_time_minutes: 0, ...extra });
  const split = (e) => [e.regularWorkMinutes, e.overtime50Minutes, e.overtime100Minutes];

  it("Saturday: every minute is overtime, first hour of the week at 1.5×", () => {
    const e = calculatePayrollEntries([job("s", "2026-06-06", "12:00")]).get("s"); // 4 h Saturday
    expect(split(e)).toEqual([0, 60, 180]);
  });

  it("Saturday after a weekday that already used the 1.5× hour: all at 2×", () => {
    const m = calculatePayrollEntries([job("m", "2026-06-01", "17:00"), job("s", "2026-06-06", "12:00")]);
    expect(split(m.get("m"))).toEqual([480, 60, 0]);
    expect(split(m.get("s"))).toEqual([0, 0, 240]);
  });

  it("Sunday: 2× from the first hour, and the week's 1.5× hour stays available", () => {
    const m = calculatePayrollEntries([job("d", "2026-05-31", "12:00"), job("m", "2026-06-01", "17:00")]);
    expect(split(m.get("d"))).toEqual([0, 0, 240]);
    expect(split(m.get("m"))).toEqual([480, 60, 0]); // the Monday overtime still gets 1.5×
  });

  it("statutory holiday on a weekday: 2× from the first hour", () => {
    const e = calculatePayrollEntries([job("h", "2026-06-24", "16:00")], { holidayDates: ["2026-06-24"] }).get("h");
    expect(split(e)).toEqual([0, 0, 480]);
  });

  it("return time on a Saturday keeps no benefits and is never overtime", () => {
    const e = calculatePayrollEntries([job("s", "2026-06-06", "13:00", { return_time_minutes: 60 })], { returnWithBenefitsTo8h: true }).get("s");
    expect(split(e)).toEqual([0, 60, 180]);
    expect(e.returnNoBenefitMinutes).toBe(60);
  });

  it("first OT hour double (subcontractor policy): Saturday all at 2×", () => {
    const e = calculatePayrollEntries([job("s", "2026-06-06", "12:00")], { firstOtHourDouble: true }).get("s");
    expect(split(e)).toEqual([0, 0, 240]);
  });
});

describe("isMealEligible (supper: 10 h 15 of work without return = 2 h 15 of overtime, weekday only)", () => {
  it("614 min of work → not eligible", () => expect(isMealEligible({ jobDate: "2026-06-01", dailyWorkMinutes: 614 })).toBe(false));
  it("615 min (10 h 15) → eligible", () => expect(isMealEligible({ jobDate: "2026-06-01", dailyWorkMinutes: 615 })).toBe(true));
  it("never eligible on a Saturday", () => expect(isMealEligible({ jobDate: "2026-06-06", dailyWorkMinutes: 700 })).toBe(false));
});

describe("calculateCongesIndemnity (CCQ 13% = 6% vacation + 5.5% holidays + 1.5% sick)", () => {
  it("$1000 weekly wages → $130 total, split 60/55/15", () => {
    const r = calculateCongesIndemnity(1000);
    expect(r.vacation).toBeCloseTo(60, 6);
    expect(r.statutoryHolidays).toBeCloseTo(55, 6);
    expect(r.sick).toBeCloseTo(15, 6);
    expect(r.total).toBeCloseTo(130, 6);
  });
  it("components always sum to the total (13%)", () => {
    const r = calculateCongesIndemnity(1234.56);
    expect(r.vacation + r.statutoryHolidays + r.sick).toBeCloseTo(r.total, 9);
    expect(r.total).toBeCloseTo(1234.56 * 0.13, 9);
  });
  it("0 or invalid wages → 0", () => {
    expect(calculateCongesIndemnity(0).total).toBe(0);
    expect(calculateCongesIndemnity(-5).total).toBe(0);
    expect(calculateCongesIndemnity(undefined).total).toBe(0);
  });
});

describe("computeWeek (authoritative contract)", () => {
  it("returns a versioned, self-describing result", () => {
    const r = computeWeek([{ id: "j1", job_date: "2026-06-01", depart: "08:00", fin: "17:00", return_time_minutes: 0 }]);
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(typeof r.generatedAt).toBe("string");
    expect(r.perJob).toHaveLength(1);
    expect(r.perJob[0].weekEnding).toBe("2026-06-06"); // Saturday of that week
  });

  it("aggregates per week with the weekly OT split (9h x5 = 40 reg / 1h @1.5 / 4h @2)", () => {
    const jobs = ["2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05"]
      .map((d, i) => ({ id: `j${i}`, job_date: d, depart: "08:00", fin: "17:00", return_time_minutes: 0 }));
    const r = computeWeek(jobs);
    expect(r.weeks).toHaveLength(1);
    expect(r.weeks[0].regularMinutes).toBe(2400);
    expect(r.weeks[0].overtime50Minutes).toBe(60);
    expect(r.weeks[0].overtime100Minutes).toBe(240);
  });

  it("flags jobs missing a time as a warning", () => {
    const r = computeWeek([{ id: "j1", job_date: "2026-06-01", depart: "08:00", fin: "", return_time_minutes: 0 }]);
    expect(r.warnings.some((w) => w.code === "missing_time")).toBe(true);
  });
});

describe("roundHours", () => {
  it("converts minutes to 2-decimal hours", () => {
    expect(roundHours(90)).toBe(1.5);
    expect(roundHours(485)).toBe(8.08);
  });
});

describe("firstTripUnpaid", () => {
  const jobs = [
    { id: "a", job_date: "2026-09-29", depart: "07:00", arrivee: "08:00", fin: "12:00", km_total: 0 },
    { id: "b", job_date: "2026-09-29", depart: "13:00", arrivee: "13:30", fin: "16:00", km_total: 0 },
  ];
  it("removes Départ→Arrivée of the first job of the day only for flagged employees", () => {
    const on = calculatePayrollEntries(jobs, { firstTripUnpaid: true });
    const off = calculatePayrollEntries(jobs);
    expect(off.get("a").totalPaidMinutes).toBe(300);
    expect(on.get("a").totalPaidMinutes).toBe(240);
    expect(on.get("b").totalPaidMinutes).toBe(180);
  });
  it("leaves jobs without Arrivée untouched", () => {
    const on = calculatePayrollEntries([{ id: "c", job_date: "2026-09-29", depart: "07:00", fin: "12:00" }], { firstTripUnpaid: true });
    expect(on.get("c").totalPaidMinutes).toBe(300);
  });
});
