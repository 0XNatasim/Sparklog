import { describe, expect, it } from "vitest";
import { weeklyCosts } from "./employer-cost";
import { isFixedPayWeek, isPayrollEmployee } from "./fixed-pay";

const taxProfile = { fixedWeeklyHours: 40, fixedPayStart: "2026-10-01", eiExempt: true };

describe("fixed weekly pay helpers", () => {
  it("pays every week from the week holding the start date", () => {
    expect(isFixedPayWeek(taxProfile, "2026-09-26")).toBe(false);
    expect(isFixedPayWeek(taxProfile, "2026-10-03")).toBe(true);
    expect(isFixedPayWeek({ fixedWeeklyHours: 40 }, "2026-10-03")).toBe(false); // no start date: never
    // Coûts / Semaine / Mois list every fixed-pay week overlapping the range.
    const weeks = weeklyCosts({ start: "2026-09-20", end: "2026-10-14", profiles: [{ id: "k", role: "owner", hourly_rate: 51 }], taxProfiles: new Map([["k", taxProfile]]) });
    expect(weeks.map((w) => w.weekEnd)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17"]);
  });

  it("puts the owner in the payroll run only with fixed pay", () => {
    expect(isPayrollEmployee({ role: "owner" }, null)).toBe(false);
    expect(isPayrollEmployee({ role: "owner" }, taxProfile)).toBe(true);
    expect(isPayrollEmployee({ role: "employee" }, null)).toBe(true);
  });

  it("costs one week: gross + employer RRQ, RQAP, FSS, CNT, CNESST, and no EI when exempt", () => {
    const employer = { annualPayrollEstimate: 0, fssCategory: "general", cnesstRate: 0.0317, workforceSkillsFundApplicable: false };
    const [cost] = weeklyCosts({ start: "2026-10-04", end: "2026-10-10", profiles: [{ id: "k", role: "owner", hourly_rate: 51 }], taxProfiles: new Map([["k", taxProfile]]), employer });
    expect(cost.minutes.worked).toBe(40 * 60);
    expect(cost.labor).toBe(2040);
    expect(Object.fromEntries(cost.contribLines.map((l) => [l.code, l.amount]))).toEqual({ rrq: 124.28, rqap: 12.28, fss: 33.66, cnt: 1.22, cnesst: 64.67 });
    expect(cost.contribTotal).toBeCloseTo(236.11, 2);
  });
});
