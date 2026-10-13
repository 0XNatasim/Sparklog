import { describe, expect, it } from "vitest";
import { PAY_RULE_DOCS, PAY_RULE_STATUSES, payRulesReference } from "./pay-rules-reference";

describe("pay rules reference sheet", () => {
  it.each(["fr", "en"])("every %s row has a label, a value, a known status and known sources", (lang) => {
    const groups = payRulesReference(lang);
    expect(groups.length).toBeGreaterThan(0);
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(row.label, row.id).toBeTruthy();
      expect(row.value, row.id).toBeTruthy();
      expect(PAY_RULE_STATUSES, row.id).toContain(row.status);
      for (const [doc] of row.sources) expect(PAY_RULE_DOCS[doc], `${row.id}:${doc}`).toBeTruthy();
    }
  });

  it("reads the values from the calculation code", () => {
    const rows = Object.fromEntries(payRulesReference("fr").flatMap((g) => g.rows).map((r) => [r.id, r]));
    expect(rows.meal.value).toContain("2 h 15");
    expect(rows["employer-benefits"].value).toContain("7,955");
    expect(rows["employer-benefits"].value).toContain("8,875");
    expect(rows.medic.value).toContain("0,68");
    expect(rows.levy.value).toContain("0,75");
  });

  it("names every per-employee option the Time rules screen offers", () => {
    const options = payRulesReference("en").flatMap((g) => g.rows).map((r) => r.option).filter(Boolean);
    for (const field of ["first_trip_unpaid", "return_with_benefits_to_8h", "overtime_first_hour_double", "team_leader_premium_overtime", "team_leader_premium_ccq"]) {
      expect(options).toContain(field);
    }
  });

  it("shows the employer values saved in Paramètres › Paie", () => {
    const rows = (ctx) => Object.fromEntries(payRulesReference("fr", ctx).flatMap((g) => g.rows).map((r) => [r.id, r]));
    const empty = rows({});
    expect([empty.cnesst.status, empty.fdrcmo.status, empty.tax.status]).toEqual(["missing", "missing", "missing"]);
    const filled = rows({ employerSettings: { annual_payroll_estimate: 900000, cnesst_rate_per_100: 5.63, cnesst_year: 2026 }, taxForms: { filled: 3, total: 3 } });
    expect(filled.cnesst.status).toBe("source");
    expect(filled.cnesst.value).toContain("5,63");
    expect(filled.fdrcmo.detail).toContain("ne s'applique pas");
    expect(filled.tax.status).toBe("source");
  });
});
