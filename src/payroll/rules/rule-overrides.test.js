import { afterEach, describe, expect, it } from "vitest";
import { calculatePayroll } from "../engine/calculatePayroll.js";
import { computeEmployeeWeekTalon } from "../employee-week.js";
import { getRules } from "./index.js";
import {
  availableRuleYears, payYearForWeek, resolveTaxYear, serializeRules, setRuleSetOverrides, validateRuleData,
} from "./rule-overrides.js";

afterEach(() => setRuleSetOverrides([]));

const base = () => JSON.parse(JSON.stringify(serializeRules()));

describe("yearly statutory scales", () => {
  it("accepts the coded 2026 scale", () => {
    expect(validateRuleData(serializeRules())).toEqual([]);
  });

  it("catches inconsistent maxima, bracket order and K constants", () => {
    const a = base(); a.ei.employeeMaximum = 900;
    expect(validateRuleData(a).join(" ")).toMatch(/Assurance-emploi/);
    const b = base(); b.federalTax.brackets[2].upTo = 100000;
    expect(validateRuleData(b).join(" ")).toMatch(/paliers doivent croître/);
    const c = base(); c.quebecTax.brackets[1].K = 3000;
    expect(validateRuleData(c).join(" ")).toMatch(/constante K du palier 2/);
    const d = base(); d.rrq.ympe = 80000;
    expect(validateRuleData(d).length).toBeGreaterThan(0);
    expect(validateRuleData(null)).toHaveLength(1);
  });

  it("installs a valid year, rejects an invalid one, and keeps 2026 intact", () => {
    const good = base(); good.rqap.employeeRate = 0.0045; good.rqap.employeeMaximum = 463.5;
    const bad = base(); bad.ei.employeeRate = 5;
    const rejected = setRuleSetOverrides([{ tax_year: 2027, data: good }, { tax_year: 2028, data: bad }]);
    expect(rejected.map((r) => r.year)).toEqual([2028]);
    expect(availableRuleYears()).toEqual([2026, 2027]);
    expect(getRules(2027, "QC").rules.rqap.employeeRate).toBe(0.0045);
    expect(getRules(2027, "QC").rules.federalTax.brackets.at(-1).upTo).toBe(Infinity);
    expect(getRules(2026, "QC").rules.rqap.employeeRate).toBe(0.0043);
    expect(getRules(2028, "QC").ok).toBe(false);
  });

  it("uses the latest earlier year when the pay year has no scale, and says so", () => {
    expect(resolveTaxYear(2027)).toEqual({ taxYear: 2026, assumedFrom: 2027 });
    expect(resolveTaxYear(2026)).toEqual({ taxYear: 2026, assumedFrom: null });
    setRuleSetOverrides([{ tax_year: 2027, data: base() }]);
    expect(resolveTaxYear(2027)).toEqual({ taxYear: 2027, assumedFrom: null });
    expect(resolveTaxYear(2029)).toEqual({ taxYear: 2027, assumedFrom: 2029 });
  });

  it("pays a week in the year of its pay date (week end + 5 days)", () => {
    expect(payYearForWeek("2026-12-13")).toBe(2026);
    expect(payYearForWeek("2026-12-20")).toBe(2026);
    expect(payYearForWeek("2026-12-27")).toBe(2027);
    expect(payYearForWeek("2027-01-03")).toBe(2027);
  });

  it("changes the deductions of the year it is entered for, not other years", () => {
    const input = (taxYear) => ({
      taxYear, provinceOfEmployment: "QC", payPeriod: { frequency: "weekly" },
      earnings: [{ type: "regular", amount: 2000 }], employer: {}, employee: {}, ytd: {},
    });
    const data = base(); data.rqap.employeeRate = 0.0050; data.rqap.employeeMaximum = 515;
    setRuleSetOverrides([{ tax_year: 2027, data }]);
    expect(calculatePayroll(input(2026)).employee.rqap).toBe(8.6);
    expect(calculatePayroll(input(2027)).employee.rqap).toBe(10);
    expect(calculatePayroll(input(2026)).employee.rqap).toBe(8.6);
  });

  it("flags a talon that fell back to the previous scale", () => {
    const out = computeEmployeeWeekTalon({
      profile: { hourly_rate: 40 }, weekDate: "2026-12-27",
      jobs: [{ job_date: "2026-12-28", depart: "07:00", arrivee: "07:30", fin: "15:30", km_total: 0, status: "approved" }],
    });
    expect(out.result.taxYearAssumedFrom).toBe(2027);
  });
});
