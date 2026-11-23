import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n";
import { buildXlsx } from "@/lib/xlsx-write";
import { weekTable, weekFileName, WEEK_WIDTHS } from "./week-export";

const t = (key) => dictionaries.fr[key];
const days = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
const cell = (date, count, hours, km) => ({ date, count, hours, km });

describe("weekTable", () => {
  const rows = [{
    employee: { full_name: "Test Employé" },
    cells: days.map((d, i) => (i === 1 ? cell(d, 2, 8.5, 120.4) : cell(d, 0, 0, 0))),
    total: 8.5, totalKm: 120.4, round: { days: 1, paid: 510 },
  }];

  it("builds a two-line header, one pair of columns per day, and an empty cell for a day without job", () => {
    const { headers, merges, rows: body } = weekTable(rows, days, t);
    expect(headers[0]).toHaveLength(headers[1].length);
    expect(headers[0]).toHaveLength(1 + 14 + 3);
    expect(merges).toContain("B1:C1");
    expect(merges).toContain("P1:Q1");
    expect(body[0]).toEqual(["Test Employé", "", "", 8.5, 120, "", "", "", "", "", "", "", "", "", "", 8.5, 120, 8.5]);
  });

  it("makes a file the app's xlsx writer accepts and names it by the week", () => {
    const { headers, merges, rows: body } = weekTable(rows, days, t);
    const bytes = buildXlsx({ rows: [...headers, ...body], headerRows: 2, merges, widths: WEEK_WIDTHS });
    expect(bytes.length).toBeGreaterThan(100);
    expect(weekFileName(days[0], days[6])).toBe("semaine 2026-11-15 au 2026-11-21.xlsx");
  });
});
