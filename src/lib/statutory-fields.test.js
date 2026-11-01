import { vi, describe, expect, it } from "vitest";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { serializeRules, validateRuleData } from "@/payroll/rules/rule-overrides";
import { dataToTexts, diffRuleData, recomputeBracketConstants, textToValue, textsToData, valueToText } from "./statutory-fields.js";
import { missingScaleAlert } from "./payroll-rates.js";

const base = serializeRules();

describe("statutory scale fields", () => {
  it("round-trips the coded 2026 scale through the screen texts", () => {
    const texts = dataToTexts(base);
    expect(texts["ei.employeeRate"]).toBe("1,3");
    expect(texts["rqap.employerRate"]).toBe("0,602");
    expect(textsToData(texts, base)).toEqual(base);
    expect(validateRuleData(textsToData(texts, base))).toEqual([]);
  });
  it("parses decimal commas and rejects text", () => {
    expect(textToValue("6,3", "pct")).toBe(0.063);
    expect(textToValue("74 600", "money")).toBe(74600);
    expect(textToValue("abc", "money")).toBeNaN();
    expect(valueToText(0.00602, "pct")).toBe("0,602");
  });
  it("flags an unreadable field and lists the changes against the base", () => {
    const texts = dataToTexts(base);
    texts["rrq.ympe"] = "";
    expect(validateRuleData(textsToData(texts, base)).join(" ")).toMatch(/rrq\.ympe/);
    const edited = dataToTexts(base); edited["ei.maxInsurableEarnings"] = "70000"; edited["federalTax.brackets.0.upTo"] = "60000";
    const diff = diffRuleData(base, textsToData(edited, base));
    expect(diff.map((d) => d.path).sort()).toEqual(["ei.maxInsurableEarnings", "federalTax.brackets.0.upTo"]);
  });
  it("recomputes the bracket constants from thresholds and rates", () => {
    const texts = dataToTexts(base); texts["federalTax.brackets.0.upTo"] = "60000";
    const next = recomputeBracketConstants(texts, base, "federalTax.brackets");
    expect(next["federalTax.brackets.1.K"]).toBe(String(Math.round(0.065 * 60000)));
    expect(next["federalTax.brackets.0.K"]).toBe("0");
  });
  it("asks for next year's scale 28 days before 1 January, and for this year's once it is missing", () => {
    expect(missingScaleAlert("2026-12-03", [2026])).toBeNull();
    expect(missingScaleAlert("2026-12-04", [2026])).toEqual({ year: 2027, daysLeft: 28, stage: 4 });
    expect(missingScaleAlert("2026-12-25", [2026]).stage).toBe(1);
    expect(missingScaleAlert("2026-12-04", [2026, 2027])).toBeNull();
    expect(missingScaleAlert("2027-01-05", [2026])).toEqual({ year: 2027, daysLeft: 0, stage: 1 });
  });
});
