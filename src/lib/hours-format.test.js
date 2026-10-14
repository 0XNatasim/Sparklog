import { describe, expect, it } from "vitest";
import { formatHM } from "./time";
import { stubUnit } from "./paystub";
import { legacyTalonSheet } from "./legacy-talon-render";

// Hours are shown as 8h45 everywhere, never 8.75 (owner request 2026-10-14).
describe("hours shown with minutes", () => {
  it("formats decimal hours as hours and minutes", () => {
    expect(formatHM(8.75)).toBe("8h45");
    expect(formatHM(40)).toBe("40h00");
    expect(formatHM(0.25)).toBe("0h15");
  });

  it("prints stub units as 8h45, but kilometres as a number", () => {
    expect(stubUnit({ unit: 8.75 })).toBe("8h45");
    expect(stubUnit({ unit: 40, unitKind: "km" })).toBe("40.00");
    expect(stubUnit({ unit: "" })).toBe("");
  });

  it("prints kept talons' hours (units and the Heures line) with minutes", () => {
    const html = legacyTalonSheet({
      header: {},
      transactions: [{ description: "Salaire régulier", unite: 38.25, taux: 50.79, montant: 1942.72 }, { description: "Indemnité KM", unite: 120, taux: 0.65, montant: 78 }],
      sommaire: [{ key: "hoursYtd", description: "Heures", periode: 38.25, cumulatif: 1234.5 }],
    });
    expect(html).toContain("38h15");
    expect(html).toContain("1234h30");
    expect(html).toContain("120.00");
    expect(html).not.toContain("38.25");
  });
});
