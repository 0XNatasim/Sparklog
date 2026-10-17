import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { dynacomCumulativeTalon, isDynacomCumulativeRow, DYNACOM_CUMULATIVE_SOURCE } from "./dynacom-cumulative-talon";
import { legacyTalonSheet } from "./legacy-talon-render";

const seed = { period_end: "2026-10-10", imported_talon: null, gross_income: 41234.5, regular_earnings: 38000, quebec_tax: 5000.12, hours_ytd: 760.25, ccq_levy: 0 };
const week = { start: dayjs("2026-10-04"), end: dayjs("2026-10-10"), weekNo: 42 };

describe("Dynacom cumulative shown as a kept talon", () => {
  it("only the row closing a Dynacom week, without a kept talon, is the cumulative", () => {
    expect(isDynacomCumulativeRow(seed)).toBe(true);
    expect(isDynacomCumulativeRow({ ...seed, imported_talon: { header: {} } })).toBe(false); // a real stub wins
    expect(isDynacomCumulativeRow({ ...seed, period_end: "2026-10-17" })).toBe(false); // Sparklog week 43
    expect(isDynacomCumulativeRow(null)).toBe(false);
  });

  it("keeps the Cumulatif column only, non-zero lines, no transactions", () => {
    const talon = dynacomCumulativeTalon(seed, { profile: { full_name: "Test", employee_number: "7" }, week });
    expect(talon.header).toMatchObject({ source: DYNACOM_CUMULATIVE_SOURCE, name: "Test", employeeNumber: "7", periodStart: "2026-10-04", periodEnd: "2026-10-10", week: "42" });
    expect(talon.transactions).toEqual([]);
    expect(talon.sommaire.map((l) => l.key)).toEqual(["grossIncome", "regularEarnings", "quebecTax", "hoursYtd"]);
    expect(talon.sommaire.every((l) => l.periode === null)).toBe(true);
    expect(talon.sommaire.find((l) => l.key === "quebecTax").cumulatif).toBe(5000.12);
  });

  it("prints as « not a talon », hours as h:mm", () => {
    const html = legacyTalonSheet(dynacomCumulativeTalon(seed, { profile: { full_name: "Test" }, week }));
    expect(html).toContain("Cumulatifs Dynacom — ce n'est pas un talon");
    expect(html).toContain("ce n'est pas un talon : seule la colonne Cumulatif est connue");
    expect(html).toContain("$41,234.50");
    expect(html).not.toContain("Talon importé (ancien système)");
  });
});
