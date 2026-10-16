import { describe, expect, it } from "vitest";
import { DYNACOM_CUMULATIVE_END, isDynacomOnlyWeek } from "./payroll-opening";

describe("weeks paid by Dynacom before Sparklog", () => {
  it("covers every week ending before the imported cumulative (week 41 and earlier)", () => {
    expect(isDynacomOnlyWeek("2026-10-03")).toBe(true);
    expect(isDynacomOnlyWeek("2026-04-04")).toBe(true);
  });

  it("leaves the cumulative's own week (42) and the next ones to Sparklog", () => {
    expect(isDynacomOnlyWeek(DYNACOM_CUMULATIVE_END)).toBe(false);
    expect(isDynacomOnlyWeek("2026-10-17")).toBe(false);
    expect(isDynacomOnlyWeek("")).toBe(false);
  });
});
