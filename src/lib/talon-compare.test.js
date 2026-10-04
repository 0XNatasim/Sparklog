import { describe, expect, it } from "vitest";
import { compareWithTalon, parseMoney } from "./talon-compare";

const talon = {
  header: { gains: "2,555.21", retenues: "1,291.94", paieNette: "1,263.27", ref: "D0008-0009" },
  sommaire: [
    { description: "Impôt Québec", key: "quebecTax", periode: 223.66, cumulatif: 223.66 },
    { description: "Impôt Fédéral", key: "federalTax", periode: 162.68, cumulatif: 162.68 },
    { description: "Heures", key: "hoursYtd", periode: 31.5, cumulatif: 31.5 },
    { description: "Temps double", key: "doubleTime", periode: 181.44, cumulatif: 181.44 },
    { description: "Autre Revenu 1", key: null, periode: 7, cumulatif: 7 },
  ],
};
const opening = { quebecTax: 0, federalTax: 0, hoursYtd: 0, doubleTime: 0 };
const totals = { gains: 2555.21, totalRetenues: 1291.94, netPlusReimb: 1263.27 };

describe("compareWithTalon", () => {
  it("parses talon money strings", () => {
    expect(parseMoney("1,263.27")).toBe(1263.27);
    expect(parseMoney("")).toBeNull();
  });

  it("is exact when every compared line matches to the cent", () => {
    const r = compareWithTalon({ opening, closing: { quebecTax: 223.66, federalTax: 162.68, hoursYtd: 31.5, doubleTime: 181.44 }, totals, talon });
    expect(r.exact).toBe(true);
    expect(r.mismatches).toBe(0);
    expect(r.lines.map((l) => l.key)).toEqual(["quebecTax", "federalTax", "hoursYtd", "doubleTime"]);
  });

  it("flags a one-cent difference with its sign and compares periods, not cumulatives", () => {
    const o = { quebecTax: 100, federalTax: 50, hoursYtd: 10, doubleTime: 20 };
    const r = compareWithTalon({
      opening: o,
      closing: { quebecTax: 323.67, federalTax: 212.68, hoursYtd: 41.5, doubleTime: 201.44 },
      totals, talon,
    });
    expect(r.exact).toBe(false);
    expect(r.mismatches).toBe(1);
    expect(r.lines.find((l) => l.key === "quebecTax")).toMatchObject({ app: 223.67, talon: 223.66, diff: 0.01, ok: false });
  });

  it("flags header totals that differ", () => {
    const r = compareWithTalon({ opening, closing: { quebecTax: 223.66, federalTax: 162.68, hoursYtd: 31.5, doubleTime: 181.44 }, totals: { ...totals, netPlusReimb: 1263.0 }, talon });
    expect(r.totals.find((l) => l.label === "Paie nette")).toMatchObject({ diff: -0.27, ok: false });
  });
});

describe("one-cent Québec tax tolerance (stub D0011-0007, S18)", () => {
  const talonS18 = {
    header: { gains: "2,887.86", retenues: "1,442.96", paieNette: "1,444.90", ref: "D0011-0007" },
    sommaire: [
      { description: "Impôt Québec", key: "quebecTax", periode: 250.36, cumulatif: 919.91 },
      { description: "Impôt Fédéral", key: "federalTax", periode: 184.05, cumulatif: 669.0 },
    ],
  };
  const opening = { quebecTax: 669.55, federalTax: 484.92 };
  const closing = { quebecTax: 669.55 + 250.35, federalTax: 484.92 + 184.05 };
  const totals = { gains: 2887.86, totalRetenues: 1442.95, netPlusReimb: 1444.91 };

  it("accepts a lone one-cent Québec difference and reports the adjustment", () => {
    const r = compareWithTalon({ opening, closing, totals, talon: talonS18 });
    expect(r.exact).toBe(false);
    expect(r.qcTolerated).toBe(true);
    expect(r.acceptable).toBe(true);
    expect(r.qcAdjustment).toBe(0.01);
  });

  it("refuses when anything else differs, or the Québec gap is not one cent", () => {
    const federalOff = compareWithTalon({ opening, closing: { ...closing, federalTax: closing.federalTax + 0.01 }, totals, talon: talonS18 });
    expect(federalOff.acceptable).toBe(false);
    const twoCents = compareWithTalon({ opening, closing: { ...closing, quebecTax: closing.quebecTax - 0.01 }, totals: { ...totals, totalRetenues: 1442.94, netPlusReimb: 1444.92 }, talon: talonS18 });
    expect(twoCents.acceptable).toBe(false);
    const gainsOff = compareWithTalon({ opening, closing, totals: { ...totals, gains: 2887.85 }, talon: talonS18 });
    expect(gainsOff.acceptable).toBe(false);
  });

  it("an exact comparison needs no adjustment", () => {
    const r = compareWithTalon({
      opening, closing: { quebecTax: 669.55 + 250.36, federalTax: 484.92 + 184.05 },
      totals: { gains: 2887.86, totalRetenues: 1442.96, netPlusReimb: 1444.9 }, talon: talonS18,
    });
    expect(r.exact).toBe(true);
    expect(r.qcTolerated).toBe(false);
    expect(r.acceptable).toBe(true);
  });
});
