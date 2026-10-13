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
    expect(rows.meal.value).toContain("10 h");
    expect(rows["employer-benefits"].value).toContain("7,955");
    expect(rows["employer-benefits"].value).toContain("8,875");
    expect(rows.medic.value).toContain("0,68");
    expect(rows.levy.value).toContain("0,75");
  });

  it("names every per-employee option the Time rules screen offers", () => {
    const options = payRulesReference("en").flatMap((g) => g.rows).map((r) => r.option).filter(Boolean);
    for (const field of ["first_trip_unpaid", "return_with_benefits_to_8h", "overtime_first_hour_double", "team_leader_premium_overtime"]) {
      expect(options).toContain(field);
    }
  });
});
