import { describe, expect, it } from "vitest";
import { compareWithTalon, parseMoney } from "./talon-compare";

const talon = {
  header: { gains: "2,555.21", retenues: "1,291.94", paieNette: "1,263.27", ref: "D0008-0009" },
  sommaire: [
    { description: "Impôt Québec", key: "quebecTax", periode: 223.66, cumulatif: 223.66 },
    { description: "Impôt Fédéral", key: "federalTax", periode: 162.68, cumulatif: 162.68 },
    { description: "Heures", key: "hoursYtd", periode: 31.5, cumulatif: 31.5 },
    { description: "Temps double", key: "doubleTime", periode: 181.44, cumulatif: 181.44 }, // not tracked
    { description: "Autre Revenu 1", key: null, periode: 7, cumulatif: 7 },
  ],
};
const opening = { quebecTax: 0, federalTax: 0, hoursYtd: 0 };
const totals = { gains: 2555.21, totalRetenues: 1291.94, netPlusReimb: 1263.27 };

describe("compareWithTalon", () => {
  it("parses talon money strings", () => {
    expect(parseMoney("1,263.27")).toBe(1263.27);
    expect(parseMoney("")).toBeNull();
  });

  it("is exact when every compared line matches to the cent", () => {
    const r = compareWithTalon({ opening, closing: { quebecTax: 223.66, federalTax: 162.68, hoursYtd: 31.5 }, totals, talon });
    expect(r.exact).toBe(true);
    expect(r.mismatches).toBe(0);
    expect(r.lines.map((l) => l.key)).toEqual(["quebecTax", "federalTax", "hoursYtd"]);
  });

  it("flags a one-cent difference with its sign and compares periods, not cumulatives", () => {
    const o = { quebecTax: 100, federalTax: 50, hoursYtd: 10 };
    const r = compareWithTalon({
      opening: o,
      closing: { quebecTax: 323.67, federalTax: 212.68, hoursYtd: 41.5 },
      totals, talon,
    });
    expect(r.exact).toBe(false);
    expect(r.mismatches).toBe(1);
    expect(r.lines.find((l) => l.key === "quebecTax")).toMatchObject({ app: 223.67, talon: 223.66, diff: 0.01, ok: false });
  });

  it("flags header totals that differ", () => {
    const r = compareWithTalon({ opening, closing: { quebecTax: 223.66, federalTax: 162.68, hoursYtd: 31.5 }, totals: { ...totals, netPlusReimb: 1263.0 }, talon });
    expect(r.totals.find((l) => l.label === "Paie nette")).toMatchObject({ diff: -0.27, ok: false });
  });
});
