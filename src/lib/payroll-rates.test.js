import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { PAYROLL_RATE_DEFS, parseRateInput, rateAlertStage, rateInputText, upcomingRateChanges } from "./payroll-rates.js";

const def = (key) => PAYROLL_RATE_DEFS.find((d) => d.key === key);

describe("payroll rate input", () => {
  it("stores percentages as fractions and accepts a decimal comma", () => {
    expect(parseRateInput("9,975", def("medic_tax_rate"))).toBe(0.09975);
    expect(parseRateInput("0.75", def("ccq_prelevement_rate"))).toBe(0.0075);
  });
  it("rejects empty, negative, non-numeric and out-of-range values", () => {
    for (const bad of ["", " ", "-1", "abc", "31"]) expect(parseRateInput(bad, def("medic_tax_rate")), bad).toBeNull();
    expect(parseRateInput("11", def("medic_employee_per_hour"))).toBeNull();
    expect(parseRateInput("1,06", def("medic_employee_per_hour"))).toBe(1.06);
  });
  it("shows a stored value the way it is typed", () => {
    expect(rateInputText(0.09975, def("medic_tax_rate"))).toBe("9,975");
    expect(rateInputText(1.06, def("medic_employee_per_hour"))).toBe("1,06");
  });
});

describe("reminder before a known rate change", () => {
  it("raises the MÉDIC tax change 28 days ahead, not before", () => {
    expect(upcomingRateChanges("2026-12-03")).toEqual([]);
    const c = upcomingRateChanges("2026-12-04");
    expect(c).toEqual([{ key: "medic_tax_rate", date: "2027-01-01", daysLeft: 28, stage: 4 }]);
  });
  it("moves to the 2-week then last-week stage and ends on the day", () => {
    expect(upcomingRateChanges("2026-12-18")[0].stage).toBe(2);
    expect(upcomingRateChanges("2026-12-25")[0].stage).toBe(1);
    expect(upcomingRateChanges("2027-01-01")).toEqual([]);
    expect([rateAlertStage(29), rateAlertStage(15), rateAlertStage(14), rateAlertStage(8), rateAlertStage(7)]).toEqual([4, 4, 2, 2, 1]);
  });
  it("includes the MÉDIC premium change and rows the owner entered", () => {
    expect(upcomingRateChanges("2027-04-01").map((c) => c.key)).toEqual(["medic_employee_per_hour", "medic_employer_per_hour"]);
    const rows = [{ key: "ccq_prelevement_rate", effectiveFrom: "2028-03-10" }];
    expect(upcomingRateChanges("2028-02-20", rows).map((c) => [c.key, c.daysLeft])).toEqual([["ccq_prelevement_rate", 19]]);
  });
});
