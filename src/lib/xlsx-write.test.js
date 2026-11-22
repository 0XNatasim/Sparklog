// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildXlsx, columnName } from "./xlsx-write";
import { readXlsxSheets } from "./xlsx-read";

describe("xlsx-write", () => {
  it("names columns like a spreadsheet", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("writes a file the reader of the app reads back: text stays text, numbers stay numbers, empty cells stay empty", async () => {
    const bytes = buildXlsx({ rows: [["Employé", "Minutes", "Note"], ["Anthony & Cie <1>", 120, ""], ["Zoé \"Z\"", { v: 0, style: "red" }, "ok"]], widths: [20, 10, 10] });
    expect(bytes[0]).toBe(0x50); // a ZIP (« PK »), what the reader and Excel expect of an .xlsx
    const [grid] = await readXlsxSheets(bytes);
    expect(grid[0]).toEqual(["Employé", "Minutes", "Note"]);
    expect(grid[1][0]).toBe("Anthony & Cie <1>");
    expect(grid[1][1]).toBe(120);
    expect(grid[1][2]).toBeUndefined();
    expect(grid[2]).toEqual(["Zoé \"Z\"", 0, "ok"]);
  });

  it("drops control characters XML cannot hold and cleans the sheet name", async () => {
    const bytes = buildXlsx({ rows: [["a"], ["x\u0001y\tz"]], sheetName: "Bad/Name:[1]" });
    const [grid] = await readXlsxSheets(bytes);
    expect(grid[1][0]).toBe("xy\tz");
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<sheet name="Bad Name  1 "');
    expect(text).toContain('<autoFilter ref="A1:A2"/>');
    expect(text).toContain('state="frozen"');
  });

  it("paints a whole row pale green / pale orange (also its empty cells), keeps the red figure red, and leaves the others plain", async () => {
    const bytes = buildXlsx({
      rows: [["a", "b", "c"], ["x", "", ""], ["y", { v: 5, style: "red" }], ["z", 1, 2]],
      rowFills: [null, "green", "orange", null],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<fgColor rgb="FFE2F0D9"/>'); // pale green
    expect(text).toContain('<fgColor rgb="FFFCE4D6"/>'); // pale orange
    expect(text).toContain('<c r="C2" s="3"/>'); // green row: an empty cell is painted too
    expect(text).toContain('<c r="B3" s="6"><v>5</v></c>'); // orange row: red figure on orange
    expect(text).toContain('<c r="C3" s="4"/>'); // orange row shorter than the table: still painted
    expect(text).not.toMatch(/<c r="[A-C]4" s=/); // plain row: no style
    const [grid] = await readXlsxSheets(bytes);
    expect(grid[1][0]).toBe("x");
    expect(grid[1][1] ?? null).toBeNull(); // painted but empty
    expect(grid[2][1]).toBe(5);
  });

  it("writes a two-line header: both lines bold, centred and wrapped, merged ranges, frozen under line 2, filter on line 2, custom heights", async () => {
    const bytes = buildXlsx({
      rows: [["Groupe", "", "Autre"], ["a", "b", ""], ["x", 1, 2]],
      headerRows: 2, merges: ["A1:B1", "C1:C2"], rowHeights: { 1: 32 },
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<mergeCells count="2"><mergeCell ref="A1:B1"/><mergeCell ref="C1:C2"/></mergeCells>');
    expect(text).toContain('<pane ySplit="2" topLeftCell="A3"');
    expect(text).toContain('<autoFilter ref="A2:C3"/>');
    expect(text).toContain('<row r="2" ht="32" customHeight="1">');
    expect(text).toContain('wrapText="1"');
    expect(text).toContain('<c r="B1" s="1"/>'); // an empty header cell keeps the header look
    expect(text).toContain('<c r="A3"') ; // body untouched
    expect(text).not.toMatch(/<c r="A3" s="/);
    const [grid] = await readXlsxSheets(bytes);
    expect(grid[0][0]).toBe("Groupe");
    expect(grid[2]).toEqual(["x", 1, 2]);
  });

  it("has a green bold font style for a cell", () => {
    const text = new TextDecoder().decode(buildXlsx({ rows: [["a"], [{ v: "Alexandre", style: "green" }]] }));
    expect(text).toContain('<color rgb="FF2E7D32"/>');
    expect(text).toContain('<c r="A2" s="7" t="inlineStr">');
  });
});
