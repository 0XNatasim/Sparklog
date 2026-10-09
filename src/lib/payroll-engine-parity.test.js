import { describe, it, expect } from "vitest";
import * as app from "./payroll-calculations";
import * as shared from "../../supabase/functions/_shared/payroll_engine.js";

// The browser facade and Edge Function import one physical implementation. These checks
// prevent someone from reintroducing a second copy and exercise policy-sensitive fixtures.
const strip = (r) => ({ ...r, generatedAt: undefined });

const fixtures = [
  [{ id: "a", job_date: "2026-06-01", depart: "08:00", fin: "17:00", return_time_minutes: 0 }],
  ["2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05"].map((d, i) => ({ id: `w${i}`, job_date: d, depart: "08:00", fin: "17:00", return_time_minutes: 0 })),
  [{ id: "m", job_date: "2026-06-01", depart: "06:00", fin: "18:00", return_time_minutes: 60 }, { id: "t", job_date: "2026-06-02", depart: "08:00", fin: "10:00" }],
  [{ id: "ov", job_date: "2026-06-03", depart: "22:00", fin: "06:00", return_time_minutes: 0 }],
  [
    { id: "sat", job_date: "2026-06-06", depart: "08:00", fin: "18:00", return_time_minutes: 30 },
    { id: "sun", job_date: "2026-06-07", depart: "08:00", fin: "18:00", return_time_minutes: 30 },
  ],
];

describe("engine parity: app copy === Edge Function copy", () => {
  it("ENGINE_VERSION matches", () => {
    expect(app.ENGINE_VERSION).toBe(shared.ENGINE_VERSION);
    expect(app.ENGINE_VERSION).toBe("2.1.0");
    expect(app.computeWeek).toBe(shared.computeWeek);
    expect(app.calculatePayrollEntries).toBe(shared.calculatePayrollEntries);
  });

  it("computeWeek produces identical output on every fixture", () => {
    for (const jobs of fixtures) {
      expect(strip(app.computeWeek(jobs))).toEqual(strip(shared.computeWeek(jobs)));
    }
  });

  it.each([
    { firstOtHourDouble: false, returnOtNoBenefits: false, messierMethod: false },
    { firstOtHourDouble: true, returnOtNoBenefits: false, messierMethod: false },
    { firstOtHourDouble: false, returnOtNoBenefits: true, messierMethod: false },
    { firstOtHourDouble: false, returnOtNoBenefits: true, messierMethod: true },
    { firstOtHourDouble: false, returnOtNoBenefits: true, messierMethod: false, firstTripUnpaid: true },
  ])("produces the same versioned result for policy options %o", (options) => {
    for (const jobs of fixtures) {
      expect(strip(app.computeWeek(jobs, options))).toEqual(strip(shared.computeWeek(jobs, options)));
    }
  });

  it("keeps employee-type policy mapping identical at the server boundary", () => {
    expect(app.overtimeOptionsFromProfile({ role: "subcontractor_1" })).toEqual({
      firstOtHourDouble: true,
      returnOtNoBenefits: true,
      firstTripUnpaid: false,
    });
    expect(app.overtimeOptionsFromProfile({
      role: "employee",
      overtime_first_hour_double: false,
      return_overtime_no_benefits: true,
    })).toEqual({ firstOtHourDouble: false, returnOtNoBenefits: true, firstTripUnpaid: false });
  });
});

describe("dayFirstTripUnpaidMinutes (overtime-proof threshold helper)", () => {
  const day = [
    { id: "b", depart: "08:45", arrivee: "08:55", fin: "11:34" },
    { id: "a", depart: "06:30", arrivee: "07:00", fin: "08:45" },
  ];

  it("takes the Départ→Arrivée of the earliest job", () => {
    expect(shared.dayFirstTripUnpaidMinutes(day)).toBe(30);
  });

  it("is 0 when the first job has no Arrivée, and for an empty day", () => {
    expect(shared.dayFirstTripUnpaidMinutes([{ id: "a", depart: "06:30", arrivee: null, fin: "08:45" }, day[0]])).toBe(0);
    expect(shared.dayFirstTripUnpaidMinutes([])).toBe(0);
  });

  it("clamps to the job's own Départ→Fin span and accepts HH:MM:SS", () => {
    expect(shared.dayFirstTripUnpaidMinutes([{ id: "a", depart: "06:30:00", arrivee: "09:00:00", fin: "07:00:00" }])).toBe(30);
  });

  it("agrees with the payroll engine's own unpaid first trip", () => {
    const jobs = day.map((job) => ({ ...job, job_date: "2026-10-09", return_time_minutes: 0 }));
    const paid = (options) => [...shared.calculatePayrollEntries(jobs, options).values()]
      .reduce((sum, entry) => sum + entry.totalPaidMinutes, 0);
    expect(paid({}) - paid({ firstTripUnpaid: true })).toBe(shared.dayFirstTripUnpaidMinutes(day));
  });
});
