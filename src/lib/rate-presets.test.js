import { describe, expect, it } from "vitest";
import { AGREEMENT_CHANGE_DATE, BEFORE_PRESET, afterPreset, presetKindForWeekStart } from "./rate-presets";

describe("rate presets", () => {
  it("switches on the first week that starts on 2026-04-26", () => {
    expect(AGREEMENT_CHANGE_DATE).toBe("2026-04-26");
    expect(presetKindForWeekStart("2026-04-05")).toBe("before"); // S16
    expect(presetKindForWeekStart("2026-04-19")).toBe("before"); // S18
    expect(presetKindForWeekStart("2026-04-26")).toBe("after"); // S19
    expect(presetKindForWeekStart("2026-06-14")).toBe("after");
  });

  it("before = 45,36 + 3,00 (the 48,36 scale); after = no premium", () => {
    expect(BEFORE_PRESET.baseRate + BEFORE_PRESET.premium).toBeCloseTo(48.36, 2);
    expect(afterPreset().premium).toBe(0);
    expect(afterPreset({ baseRate: 50.79 }).baseRate).toBe(50.79);
  });
});
