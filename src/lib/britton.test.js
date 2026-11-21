// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildZip } from "@/lib/zip-store";
import { createFakeSupabase } from "@/test/fake-supabase";
vi.mock("@/supabaseClient", () => ({ supabase: {} }));
const { attachBritton, missingColumns, brittonOt, fetchBrittonRows, findHeader, importBrittonRows, nameKey, parseBrittonDate, parseBrittonGrid, readBrittonFile } = await import("./britton");

const HEAD = ["Heure de fin", "Nom et Prénom Électricien", "Compagnie", "OT", "Temps d'exécution (min)", "Temps de retour (min)", "Date", "Note", "Durée du temps supp"];
// Lines of the Britton table of 19-20 November (names changed to neutral ones).
const SAMPLE = [
  HEAD,
  ["11/19/26 14:17", "Anthony Fortin", "Messier Connexion", "OT-211794", 15, 15, "11/19/2026", null, 30],
  ["11/20/26 9:30", "Cedrick Bertin", "Messier Connexion", "OT-212306", 105, 45, "11/19/2026", null, 150],
  ["11/19/26 18:31", "Vanessa Mcgraw-robichaud", "Messier Connexion", "OT-234262", 58, 60, "11/18/2026", "à vérifier", 118],
];

// The real titles of the file Britton sends (19-20 November): « Temps d'éxécution » (typo included), « Date installation ».
const REAL_HEAD = ["Heure de fin", "Nom et Prénom Électricien", "Compagnie", "OT", "Temps d'éxécution", "Temps de retour", "Date installation", "Note", "Durée du temps supplémentaire réelle - minutes"];

describe("Britton table: the older layout of 16-18 November", () => {
  const OLD_HEAD = ["Heure de fin", "Prénom Nom", "Entreprise", "Numéro du OT-XXXXXX", "client ", "Auto", "date ", "Note", "Colonne1", "heure total en TS"];
  it("reads « client » = at the client, « Auto » = return, « heure total en TS » = total, and the day of the end time", () => {
    const grid = [
      OLD_HEAD,
      ["11/16/2026 16:22", "Personne Un", "Messier Connexion", "OT-216481", "75", "15", "", "", "#NAME?", "90"],
      ["11/18/26 15:43", "Personne Deux", "Messier Connexion", "OT-269789", "45", "15", "11/18/2026", "", "#NAME?", "60"],
    ];
    const parsed = parseBrittonGrid(grid);
    expect(parsed.headerFound).toBe(true);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ job_date: "2026-11-16", ot: "216481", client_minutes: 75, return_minutes: 15, total_minutes: 90, company: "Messier Connexion" });
    expect(parsed.rows[1]).toMatchObject({ job_date: "2026-11-18", ot: "269789", client_minutes: 45, return_minutes: 15 });
  });

  it("reads it from a comma-separated CSV", async () => {
    const text = `${OLD_HEAD.join(",")}\r\n11/16/2026 16:22,Personne Un,Messier Connexion,OT-216481,75,15,,,#NAME?,90\r\n`;
    const parsed = await readBrittonFile(new TextEncoder().encode(text));
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows).toHaveLength(1);
  });
});

describe("Britton table: the real file", () => {
  it("recognises the real titles (« éxécution ») and takes the day from « Heure de fin », not from the « Date installation » column", () => {
    expect(findHeader([REAL_HEAD])).toMatchObject({ row: 0, columns: { endedAt: 0, name: 1, ot: 3, client: 4, returned: 5, total: 8 } });
    expect(findHeader([REAL_HEAD]).columns.date).toBeUndefined(); // that column is the submission date: never read
    const { rows, skipped } = parseBrittonGrid([
      REAL_HEAD,
      ["11/19/26 14:17", "Personne Un ", "Messier Connexion", "OT-211794", 15, 15, "11/21/2026", null, 30],
      ["11/20/26 9:30", "Personne Deux", "Messier Connexion", "OT-212306", 105, 45, "11/19/2026", null, 150],
      ["11/16/26 15:54", "Personne Trois", "Messier Connexion", "OT-202694", 75, 45, null, null, 120],
    ]);
    // the day is the end time's day whatever the other date column says (11/21 and 11/19 above are ignored); a blank one is no problem
    expect(rows.map((row) => [row.ot, row.job_date, row.client_minutes, row.return_minutes])).toEqual([["211794", "2026-11-19", 15, 15], ["212306", "2026-11-20", 105, 45], ["202694", "2026-11-16", 75, 45]]);
    expect(rows[0].employee_name).toBe("Personne Un"); // trailing space dropped
    expect(skipped).toEqual([]);
  });

  it("lists a line without a readable « Heure de fin », never guessing its day from another column", () => {
    const { rows, skipped } = parseBrittonGrid([REAL_HEAD, ["", "Personne Un", "M", "OT-211794", 15, 15, "11/19/2026", null, 30], ["n'importe quoi", "Personne Deux", "M", "OT-212306", 1, 1, "11/19/2026", null, 2]]);
    expect(rows).toEqual([]);
    expect(skipped).toEqual([{ line: 2, reason: "date" }, { line: 3, reason: "date" }]);
  });

  it("says which columns are missing: the end time is needed, the « Date » column is not", () => {
    expect(missingColumns([["Nom", "OT", "Temps d'exécution", "Temps de retour", "Heure"]])).toEqual(["endedAt"]);
    expect(missingColumns([["Nom", "OT", "Temps d'exécution", "Temps de retour", "Date installation"]])).toEqual(["endedAt"]);
    expect(missingColumns([["a", "b"]])).toEqual(["name", "ot", "client", "returned", "endedAt"]);
    expect(parseBrittonGrid([["Nom", "OT", "Temps d'exécution", "Temps de retour"]])).toMatchObject({ headerFound: false, missing: ["endedAt"] });
  });
});

describe("Britton table", () => {
  it("finds the header whatever the cut titles are, and reads the lines (month first dates)", () => {
    expect(findHeader([[], HEAD])).toMatchObject({ row: 1, columns: { endedAt: 0, name: 1, ot: 3, client: 4, returned: 5, total: 8 } });
    const { rows, skipped, headerFound } = parseBrittonGrid(SAMPLE);
    expect(headerFound).toBe(true);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      job_date: "2026-11-19", ot: "211794", employee_name: "Anthony Fortin", name_key: "anthony fortin", company: "Messier Connexion",
      ended_at: "2026-11-19 14:17", client_minutes: 15, return_minutes: 15, total_minutes: 30, note: null,
    });
    expect(rows[1].job_date).toBe("2026-11-20"); // the day is the end time's day (20 November 9:30); the « Date » column is ignored
    expect(rows[2]).toMatchObject({ job_date: "2026-11-19", name_key: "vanessa mcgraw robichaud", note: "à vérifier", total_minutes: 118 });
  });

  it("ignores empty lines, lists what it cannot read, keeps the last of a repeated line and fills a missing total", () => {
    const grid = [HEAD, [], ["", "", "", "", "", "", "", "", ""],
      ["11/19/26 14:17", "Anthony Fortin", "M", "OT-211794", 15, 15, "11/19/2026", null, null],
      ["11/19/26 14:17", "Anthony Fortin", "M", "OT-211794", 20, 15, "11/19/2026", null, null],
      ["x", "Sans OT", "M", "FORMATION", 15, 15, "11/19/2026", null, 30],
      ["13/45/26 9:00", "Date folle", "M", "OT-111111", 15, 15, "11/19/2026", null, 30],
      ["11/19/26 9:00", "Minutes folles", "M", "OT-222222", "abc", 15, "11/19/2026", null, 30],
      ["11/19/26 9:00", "", "M", "OT-333333", 1, 1, "11/19/2026", null, 2]];
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

  it("a line ending one or two days after the work day still goes with it; three days later does not (the day is the end time's day)", () => {
    const later = (days) => line("b1", { job_date: `2026-11-${19 + days}` });
    expect(attachBritton([proof("p1")], [later(0)]).rows[0].britton?.id).toBe("b1");
    expect(attachBritton([proof("p1")], [later(1)]).rows[0].britton?.id).toBe("b1");
    expect(attachBritton([proof("p1")], [later(2)]).rows[0].britton?.id).toBe("b1");
    expect(attachBritton([proof("p1")], [later(3)]).rows[0].britton).toBeNull();
    // a line that ended BEFORE the work day is not that work order
    expect(attachBritton([proof("p1")], [line("b1", { job_date: "2026-11-18" })]).rows[0].britton).toBeNull();
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
  it("takes each line's day from its stored end time (older imports used the submission date) and keeps the latest import of a line", async () => {
    const rows = [
      { id: "old", job_date: "2026-11-19", ot: "212306", name_key: "cedrick bertin", ended_at: "2026-11-20T09:30:00", imported_at: "2026-11-21T19:12:00Z", client_minutes: 105 }, // imported with the submission date
      { id: "new", job_date: "2026-11-20", ot: "212306", name_key: "cedrick bertin", ended_at: "2026-11-20 09:30:00", imported_at: "2026-11-22T10:00:00Z", client_minutes: 100 }, // same line, re-imported
      { id: "x", job_date: "2026-11-19", ot: "111111", name_key: "x", ended_at: null, imported_at: "2026-11-21T19:12:00Z", client_minutes: 5 },
      { id: "early", job_date: "2026-11-14", ot: "222222", name_key: "y", ended_at: "2026-11-14T10:00:00", imported_at: "2026-11-21T19:12:00Z", client_minutes: 5 },
    ];
    const client = { from: () => ({ select: () => ({ gte: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }) }) };
    const lines = await fetchBrittonRows(client, "2026-11-16");
    expect(lines.map((item) => [item.id, item.job_date]).sort()).toEqual([["new", "2026-11-20"], ["x", "2026-11-19"]]); // one line for the end time, no line before the first day
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
