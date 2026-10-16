import { describe, expect, it, vi } from "vitest";
vi.mock("../supabaseClient", () => ({ supabase: {} }));
import { employerFromSettings, taxProfileFromRow } from "./payroll-settings";

describe("payroll settings → engine inputs", () => {
  it("converts the CNESST rate per 100 $ and flags FDRCMO above 2 M$", () => {
    expect(employerFromSettings({ annual_payroll_estimate: 2500000, fss_category: "general", cnesst_rate_per_100: 5.63 }))
      .toEqual({ annualPayrollEstimate: 2500000, fssCategory: "general", cnesstRate: 0.0563, workforceSkillsFundApplicable: true });
    expect(employerFromSettings({ annual_payroll_estimate: 900000, cnesst_rate_per_100: null }).workforceSkillsFundApplicable).toBe(false);
  });

  it("leaves the CNESST rate undefined when the notice is not entered (no guess)", () => {
    expect(employerFromSettings({ annual_payroll_estimate: null, cnesst_rate_per_100: null }).cnesstRate).toBeUndefined();
    expect(employerFromSettings(null).cnesstRate).toBeUndefined();
  });

  it("maps the TD1 / TP-1015.3 amounts; an empty claim means the basic amount", () => {
    expect(taxProfileFromRow({ td1_claim_amount: "18000", federal_additional_tax: "25", tp1015_3_credits: null, quebec_additional_tax: "0" }))
      .toEqual({ td1ClaimAmount: 18000, federalAdditionalTax: 25, personalTaxCredits: undefined, quebecAdditionalTax: 0, fixedWeeklyHours: 0, fixedPayStart: "", eiExempt: false, rrqExempt: false });
    expect(taxProfileFromRow({ fixed_weekly_hours: "40.00", fixed_pay_start: "2026-10-04", ei_exempt: true }))
      .toMatchObject({ fixedWeeklyHours: 40, fixedPayStart: "2026-10-04", eiExempt: true });
    expect(taxProfileFromRow({ rrq_exempt: true })).toMatchObject({ rrqExempt: true, eiExempt: false });
    expect(taxProfileFromRow(null)).toBeNull();
  });
});
