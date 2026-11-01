import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
import { PAYROLL_RATE_DEFS, parseRateInput, rateInputText } from "./payroll-rates.js";

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
