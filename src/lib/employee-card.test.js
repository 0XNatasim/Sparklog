import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { employeeCardTabs, matchesEmployeeSearch } from "./employees-panel";
import { parsePayAmount, payRuleToggles, reimbursements } from "./pay-options";
import { taxFormRow, taxProfileUpsert } from "./tax-profile";

// Gestion V3 employee card (V2.4.180): which tabs, the search box, and the rules it shares with
// Règles de temps and Paramètres › TD1.
describe("employeeCardTabs", () => {
  it("shows CCQ to tradespeople and subcontractors, Impôts to a manager-tier viewer only", () => {
    expect(employeeCardTabs({ role: "employee" }, "owner")).toEqual(["identity", "ccq", "pay", "tax", "access"]);
    expect(employeeCardTabs({ role: "admin" }, "manager")).toEqual(["identity", "pay", "tax", "access"]);
    expect(employeeCardTabs({ role: "subcontractor_1" }, "owner")).toEqual(["identity", "ccq", "pay", "access"]);
    expect(employeeCardTabs({ role: "employee" }, "admin")).toEqual(["identity", "ccq", "pay", "access"]);
  });
});

describe("matchesEmployeeSearch", () => {
  const p = { full_name: "Zoé Tremblay", email: "zoe@test.ca", phone: "(514) 555-0101", employee_number: "09", ccq_number: "123456" };
  it("matches every word on name, e-mail, numbers or phone digits, without accents", () => {
    expect(matchesEmployeeSearch(p, "")).toBe(true);
    expect(matchesEmployeeSearch(p, "ZOE trem")).toBe(true);
    expect(matchesEmployeeSearch(p, "test.ca")).toBe(true);
    expect(matchesEmployeeSearch(p, "5550101")).toBe(true);
    expect(matchesEmployeeSearch(p, "09")).toBe(true);
    // No CCQ number in the card since V2.4.192: it is not searched either.
    expect(matchesEmployeeSearch(p, "123456")).toBe(false);
    expect(matchesEmployeeSearch(p, "zoé bob")).toBe(false);
  });
});

describe("pay options (same list as Règles de temps)", () => {
  it("locks the subcontractor boxes and adds the premium box for a team leader only", () => {
    expect(payRuleToggles({ role: "employee" }).map((r) => r.field)).toEqual(["first_trip_unpaid", "return_with_benefits_to_8h", "overtime_first_hour_double"]);
    const sub = payRuleToggles({ role: "subcontractor_1", team_leader_premium: 1 });
    expect(sub.map((r) => [r.field, r.locked])).toEqual([["first_trip_unpaid", false], ["return_with_benefits_to_8h", true], ["overtime_first_hour_double", true], ["team_leader_premium_overtime", true]]);
    expect(reimbursements("admin")).toEqual({ km: false, storage: false });
    expect(reimbursements("employee")).toEqual({ km: true, storage: true });
    expect(reimbursements("subcontractor_1")).toEqual({ km: true, storage: false });
  });

  it("reads an amount: empty = none, comma accepted, negative refused", () => {
    expect(parsePayAmount("km_rate", "")).toBeNull();
    expect(parsePayAmount("phone_data_reimbursement", "")).toBe(0);
    expect(parsePayAmount("km_rate", "0,7")).toBe(0.7);
    expect(parsePayAmount("km_rate", "-1")).toBeNaN();
  });
});

describe("tax profile (same row as Paramètres › TD1)", () => {
  const profile = { id: "u1", full_name: "Zoé", hourly_rate: 40 };
  it("turns the row into fields and back, refusing bad amounts and fixed pay without a start", () => {
    const row = taxFormRow(profile, { td1_claim_amount: 16452, federal_additional_tax: 0, ei_exempt: true });
    expect(row).toMatchObject({ td1_claim_amount: "16452", federal_additional_tax: "", ei_exempt: true, rrq_exempt: false, hourly_rate: 40 });
    const { payload } = taxProfileUpsert({ ...row, td1_claim_amount: "17 000,50" }, "me", new Date("2026-10-25T12:00:00Z"));
    expect(payload).toMatchObject({ user_id: "u1", td1_claim_amount: 17000.5, federal_additional_tax: 0, tp1015_3_credits: null, fixed_weekly_hours: null, fixed_pay_start: null, ei_exempt: true, updated_by: "me" });
    expect(taxProfileUpsert({ ...row, td1_claim_amount: "abc" }).error).toBe("payrollSettings.invalid");
    expect(taxProfileUpsert({ ...row, fixed_weekly_hours: "90", fixed_pay_start: "2026-10-04" }).error).toBe("payrollSettings.invalid");
    expect(taxProfileUpsert({ ...row, fixed_weekly_hours: "40" }).error).toBe("payrollSettings.fixedStartRequired");
  });
});
