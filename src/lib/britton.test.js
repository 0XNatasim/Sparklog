// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildZip } from "@/lib/zip-store";
import { createFakeSupabase } from "@/test/fake-supabase";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const { attachBritton, brittonOt, fetchBrittonRows, findHeader, importBrittonRows, nameKey, parseBrittonDate, parseBrittonGrid, readBrittonFile } = await import("./britton");

const HEAD = ["Heure de fin", "Nom et Prénom Électricien", "Compagnie", "OT", "Temps d'exécution (min)", "Temps de retour (min)", "Date", "Note", "Durée du temps supp"];
// Lines of the Britton table of 19-20 November (names changed to neutral ones).
const SAMPLE = [
  HEAD,
  ["11/19/26 14:17", "Anthony Fortin", "Messier Connexion", "OT-211794", 15, 15, "11/19/2026", null, 30],
  ["11/20/26 9:30", "Cedrick Bertin", "Messier Connexion", "OT-212306", 105, 45, "11/19/2026", null, 150],
  ["11/19/26 18:31", "Vanessa Mcgraw-robichaud", "Messier Connexion", "OT-234262", 58, 60, "11/18/2026", "à vérifier", 118],
];

describe("Britton table", () => {
  it("finds the header whatever the cut titles are, and reads the lines (month first dates)", () => {
    expect(findHeader([[], HEAD])).toMatchObject({ row: 1, columns: { name: 1, ot: 3, client: 4, returned: 5, date: 6, total: 8 } });
    const { rows, skipped, headerFound } = parseBrittonGrid(SAMPLE);
    expect(headerFound).toBe(true);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      job_date: "2026-11-19", ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", company: "Messier Connexion",
      ended_at: "2026-11-19 14:17", client_minutes: 15, return_minutes: 15, total_minutes: 30, note: null,
    });
    expect(rows[1].job_date).toBe("2026-11-19"); // the Date column is the work day, not the end time (20 November 9:30)
    expect(rows[2]).toMatchObject({ job_date: "2026-11-18", name_key: "vanessa mcgraw robichaud", note: "à vérifier", total_minutes: 118 });
  });

  it("ignores empty lines, lists what it cannot read, keeps the last of a repeated line and fills a missing total", () => {
    const grid = [HEAD, [], ["", "", "", "", "", "", "", "", ""],
      ["11/19/26 14:17", "Anthony Fortin", "M", "OT-211794", 15, 15, "11/19/2026", null, null],
      ["11/19/26 14:17", "Anthony Fortin", "M", "OT-211794", 20, 15, "11/19/2026", null, null],
      ["x", "Sans OT", "M", "FORMATION", 15, 15, "11/19/2026", null, 30],
      ["x", "Date folle", "M", "OT-111111", 15, 15, "13/45/2026", null, 30],
      ["x", "Minutes folles", "M", "OT-222222", "abc", 15, "11/19/2026", null, 30],
      ["x", "", "M", "OT-333333", 1, 1, "11/19/2026", null, 2]];
    const { rows, skipped } = parseBrittonGrid(grid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ client_minutes: 20, total_minutes: 35 });
    expect(skipped.map((item) => [item.line, item.reason])).toEqual([[6, "ot"], [7, "date"], [8, "minutes"], [9, "name"]]);
  });

  it("says when it is not the Britton table", () => {
    expect(parseBrittonGrid([["a", "b"], [1, 2]]).headerFound).toBe(false);
  });

  it("reads dates, OT numbers and names the same way on both sides", () => {
    expect(parseBrittonDate("2026-11-19")).toEqual({ day: "2026-11-19", time: null });
    expect(parseBrittonDate("2026-11-19 14:17")).toEqual({ day: "2026-11-19", time: "14:17" });
    expect(parseBrittonDate("11/20/26 9:30")).toEqual({ day: "2026-11-20", time: "09:30" });
    expect(parseBrittonDate("31/11/2026")).toBeNull();
    expect(brittonOt("OT-234262")).toBe("234262");
    expect(brittonOt("234262")).toBe("234262");
    expect(brittonOt("FORMATION HQ")).toBeNull();
    expect(nameKey("  Jean-François  Couture ")).toBe("jean francois couture");
  });
});

// A real .xlsx built in the test (a ZIP of stored XML files): shared strings, a date style, a number, an inline string.
function xlsxBytes() {
  const enc = (text) => new TextEncoder().encode(text);
  const serial = (y, m, d, minutes = 0) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 + minutes / 1440;
  const strings = ["Heure de fin", "Nom et Prénom Électricien", "Compagnie", "OT", "Temps d'exécution", "Temps de retour", "Date", "Note", "Durée du temps supp", "Anthony Fortin", "Messier Connexion", "OT-211794"];
  const head = strings.slice(0, 9).map((_, i) => `<c r="${"ABCDEFGHI"[i]}1" t="s"><v>${i}</v></c>`).join("");
  const sheet = `<?xml version="1.0"?><worksheet><sheetData><row r="1">${head}</row><row r="2">`
    + `<c r="A2" s="1"><v>${serial(2026, 11, 19, 14 * 60 + 17)}</v></c><c r="B2" t="s"><v>9</v></c><c r="C2" t="s"><v>10</v></c><c r="D2" t="s"><v>11</v></c>`
    + `<c r="E2"><v>15</v></c><c r="F2"><v>15</v></c><c r="G2" s="2"><v>${serial(2026, 11, 19)}</v></c><c r="H2" t="inlineStr"><is><t>ok</t></is></c><c r="I2"><v>30</v></c></row></sheetData></worksheet>`;
  const styles = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="m/d/yy\\ h:mm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
  const shared = `<sst>${strings.map((text) => `<si><t>${text}</t></si>`).join("")}</sst>`;
  return buildZip([
    { name: "[Content_Types].xml", data: enc("<Types/>") }, { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
    { name: "xl/sharedStrings.xml", data: enc(shared) }, { name: "xl/styles.xml", data: enc(styles) },
  ]);
}

describe("readBrittonFile", () => {
  it("reads an .xlsx: date cells (by their format) become dates without any shift, numbers stay numbers", async () => {
    const parsed = await readBrittonFile(xlsxBytes());
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows).toEqual([{
      job_date: "2026-11-19", ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", company: "Messier Connexion",
      ended_at: "2026-11-19 14:17", client_minutes: 15, return_minutes: 15, total_minutes: 30, note: "ok",
    }]);
  });
  it("refuses the old binary .xls and finds nothing in a file that is not the Britton table", async () => {
    await expect(readBrittonFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/xlsx_unsupported/);
    expect((await readBrittonFile(new Uint8Array([1, 2, 3, 4]))).headerFound).toBe(false);
    await expect(readBrittonFile(new Uint8Array([0x50, 0x4b, 1, 2]))).rejects.toThrow(/xlsx_invalid/); // starts like a ZIP but is not one
  });
});

describe("readBrittonFile (.csv)", () => {
  const expected = { job_date: "2026-11-19", ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", client_minutes: 15, return_minutes: 15, total_minutes: 30 };
  const frenchHeader = "Heure de fin;Nom et Prénom Électricien;Compagnie;OT;Temps d'exécution;Temps de retour;Date;Note;Durée du temps supp";

  it("reads a French Excel CSV (semicolons, Windows-1252 accents, decimal commas)", async () => {
    const text = `${frenchHeader}\r\n11/19/26 14:17;Anthony Fortin;Messier Connexion;OT-211794;15,0;15;11/19/2026;;30\r\n`;
    const bytes = new Uint8Array([...text].map((ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63))); // Latin-1 / Windows-1252: « é » is one byte
    const parsed = await readBrittonFile(bytes);
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ ...expected, ended_at: "2026-11-19 14:17", company: "Messier Connexion" });
  });

  it("reads an English CSV with quotes and a UTF-8 byte-order mark, and a tab-separated one", async () => {
    const comma = '\uFEFF"Heure de fin","Nom et Prénom Électricien","Compagnie","OT","Temps d\'exécution","Temps de retour","Date","Note","Durée"\n"11/19/26 14:17","Anthony Fortin","Messier, Connexion","OT-211794",15,15,"2026-11-19","dit ""ok""",30\n';
    const a = await readBrittonFile(new TextEncoder().encode(comma));
    expect(a.rows[0]).toMatchObject({ ...expected, company: "Messier, Connexion", note: 'dit "ok"' });
    const tab = frenchHeader.replaceAll(";", "\t") + "\n11/19/26 14:17\tAnthony Fortin\tM\tOT-211794\t15\t15\t11/19/2026\t\t30\n";
    expect((await readBrittonFile(new TextEncoder().encode(tab))).rows[0]).toMatchObject(expected);
  });

  it("lists a line it cannot read like the Excel file does", async () => {
    const text = `${frenchHeader}\n11/19/26 14:17;Anthony Fortin;M;FORMATION;15;15;11/19/2026;;30\n`;
    const parsed = await readBrittonFile(new TextEncoder().encode(text));
    expect(parsed.rows).toEqual([]);
    expect(parsed.skipped).toEqual([{ line: 2, reason: "ot" }]);
  });
});

describe("attachBritton", () => {
  const proof = (id, extra = {}) => ({ id, jobDate: "2026-11-19", jobOt: "211794", name: "Anthony Fortin", found: {}, expected: { clientMinutes: 15, returnMinutes: 15 }, ...extra });
  const line = (id, extra = {}) => ({ id, job_date: "2026-11-19", ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", client_minutes: 15, return_minutes: 15, total_minutes: 30, ...extra });

  it("puts the Britton line beside the proof of the same day and OT, and marks the minutes that differ", () => {
    const { rows, unmatched } = attachBritton([proof("p1"), proof("p2", { jobOt: "999999", jobDate: "2026-11-19" })], [line("b1")]);
    expect(rows[0].britton.id).toBe("b1");
    expect([...rows[0].brittonWrong]).toEqual([]);
    expect(rows[1].britton).toBeNull();
    expect(unmatched).toEqual([]);
    const gap = attachBritton([proof("p1")], [line("b1", { client_minutes: 60, return_minutes: 25 })]).rows[0];
    expect([...gap.brittonWrong].sort()).toEqual(["client", "return"]);
    const near = attachBritton([proof("p1")], [line("b1", { client_minutes: 30, return_minutes: 20 })]).rows[0]; // inside the 15 / 5 minute tolerances
    expect([...near.brittonWrong]).toEqual([]);
  });

  it("takes the line of the same name when two electricians share an OT, and lists the lines without proof", () => {
    const lines = [line("b1", { name_key: "autre personne", employee_name: "Autre Personne", client_minutes: 90 }), line("b2"), line("b3", { ot: "555555" })];
    const { rows, unmatched } = attachBritton([proof("p1")], lines);
    expect(rows[0].britton.id).toBe("b2");
    expect(unmatched.map((item) => item.id).sort()).toEqual(["b1", "b3"]);
  });
});

describe("import and read", () => {
  it("sends the lines by chunks and adds the counts up", async () => {
    const fake = createFakeSupabase({ rpcs: { import_britton_overtime: () => ({ inserted: 400, updated: 100 }) } });
    const rows = Array.from({ length: 1100 }, (_, i) => ({ ot: String(100000 + i) }));
    expect(await importBrittonRows(fake.client, rows)).toEqual({ inserted: 1200, updated: 300 });
    expect(fake.calls.filter((call) => call.rpc === "import_britton_overtime")).toHaveLength(3);
  });
  it("reads no line when the table does not exist yet (migration not applied)", async () => {
    const client = { from: () => ({ select: () => ({ gte: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'relation "public.britton_overtime" does not exist' } }) }) }) }) }) };
    expect(await fetchBrittonRows(client, "2026-11-16")).toEqual([]);
  });
});

describe("migration 0156 (source lock)", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261121200000_0156_britton_overtime_import.sql"), "utf8");
  it("is manager-only, validated line by line, replayable, audited and never writable directly", () => {
    expect(sql).toMatch(/revoke all on public\.britton_overtime from public, anon, authenticated;\s+grant select on public\.britton_overtime to authenticated;/);
    expect(sql).toMatch(/get_my_role\(\) <> 'manager'/);
    expect(sql).toMatch(/unique \(job_date, ot, name_key\)/);
    expect(sql).toMatch(/on conflict \(job_date, ot, name_key\) do update/);
    expect(sql).toMatch(/total > 1000/);
    expect(sql).toMatch(/britton_row_invalid/);
    expect(sql).toMatch(/britton_overtime_imported/);
    expect(sql).toMatch(/revoke all on function public\.import_britton_overtime\(jsonb\) from public, anon/);
  });
});
