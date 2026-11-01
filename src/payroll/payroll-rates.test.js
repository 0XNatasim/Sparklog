import { afterEach, describe, expect, it } from "vitest";
import {
  computeCcqLevies, employeePensionRateFor, employerSocialBenefitRateFor, getPayrollRateOverrides, medicRatesOn, medicTaxRateOn,
  payrollRateOn, setPayrollRateOverrides,
} from "./ccq-benefits.js";

afterEach(() => setPayrollRateOverrides([]));

describe("owner-editable payroll rates (0130)", () => {
  it("changes nothing when no row is loaded", () => {
    expect(medicRatesOn("2026-10-11").employeePerHour).toBe(0.68);
    expect(medicTaxRateOn("2027-02-07")).toBe(0.09975);
    expect(employeePensionRateFor("journeyman", "2026-10-11")).toBe(0.09);
    expect(employeePensionRateFor("apprentice2", "2026-10-11")).toBe(0.045);
    expect(employerSocialBenefitRateFor("journeyman", "2026-10-11")).toBe(8.875);
  });

  it("applies the latest row that has started, never to earlier weeks", () => {
    setPayrollRateOverrides([
      { key: "medic_tax_rate", effective_from: "2029-01-01", value: 0.1 },
      { key: "medic_employee_per_hour", effective_from: "2027-04-25", value: 1.2 },
    ]);
    expect(medicTaxRateOn("2028-12-31")).toBe(0.09975);
    expect(medicTaxRateOn("2029-01-01")).toBe(0.1);
    expect(medicRatesOn("2027-04-24").employeePerHour).toBe(0.68);
    expect(medicRatesOn("2027-04-25").employeePerHour).toBe(1.2);
    expect(medicRatesOn("2027-04-25").employerPerHour).toBe(3.31); // untouched
  });

  it("drives levy, pension and social-benefit rates by level group", () => {
    setPayrollRateOverrides([
      { key: "ccq_prelevement_rate", effective_from: "2027-01-01", value: 0.01 },
      { key: "caisse_education_per_hour", effective_from: "2027-01-01", value: 0.05 },
      { key: "pension_rate_apprentice", effective_from: "2027-01-01", value: 0.05 },
      { key: "social_benefit_journeyman", effective_from: "2027-01-01", value: 9.5 },
    ]);
    const before = computeCcqLevies({ hours: 40, hourlyWage: 50, date: "2026-12-27" });
    const after = computeCcqLevies({ hours: 40, hourlyWage: 50, date: "2027-01-03" });
    expect(before.caisseEducationSyndicale).toBe(0.8);
    expect(after.caisseEducationSyndicale).toBe(2);
    expect(after.prelevementCcq).toBeGreaterThan(before.prelevementCcq);
    expect(employeePensionRateFor("apprentice3", "2027-01-03")).toBe(0.05);
    expect(employeePensionRateFor("journeyman", "2027-01-03")).toBe(0.09);
    expect(employerSocialBenefitRateFor("journeyman", "2027-01-03")).toBe(9.5);
    expect(employerSocialBenefitRateFor("apprentice1", "2027-01-03")).toBe(7.955);
  });

  it("ignores unknown keys, bad dates and non-numeric values", () => {
    setPayrollRateOverrides([
      { key: "nope", effective_from: "2027-01-01", value: 1 },
      { key: "medic_tax_rate", effective_from: "soon", value: 0.2 },
      { key: "medic_tax_rate", effective_from: "2027-01-01", value: "abc" },
      { key: "medic_tax_rate", effective_from: "2027-01-01", value: 0.2 },
    ]);
    expect(getPayrollRateOverrides()).toHaveLength(1);
    expect(payrollRateOn("medic_tax_rate", "2027-06-01", 0.09)).toBe(0.2);
  });
});
