import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Runs the Google Apps Script doPost (pasted by hand in Google) against an in-memory sheet.
const source = readFileSync(new URL("../../supabase/functions/push_approved_batch/apps-script-doPost.js", import.meta.url), "utf8");

function run(batches) {
  const cells = []; // cells[row-1][col-1]
  const at = (r) => (cells[r - 1] = cells[r - 1] || []);
  const width = () => cells.reduce((m, row) => Math.max(m, row.length), 0);
  const read = (r, c, nr, nc) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => at(r + i)[c - 1 + j] ?? ""));
  const sheet = {
    getLastColumn: () => width(),
    getLastRow: () => cells.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getDisplayValues: () => read(r, c, nr, nc).map((row) => row.map(String)),
      getValues: () => read(r, c, nr, nc),
      setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => { at(r + i)[c - 1 + j] = v; })),
      setValue: (v) => { at(r)[c - 1] = v; },
    }),
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === "Data" ? sheet : null), getSpreadsheetTimeZone: () => "America/Toronto" }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "tok" }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: "json" } },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    LL: null,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  for (const rows of batches) {
    const result = JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token: "tok", rows }) } }));
    expect(result.success).toBe(true);
  }
  const header = cells[0];
  return cells.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i]])));
}

const row = (id, depart, fin, heures, extra = {}) => ({
  job_id: id, job_date: "2026-11-03", employee_name: "Paul", employee_email: "p@x.test", ot: "CONTREMAÎTRE",
  depart, arrivee: depart, fin, heures, km_aller: 5, employee_day_minimum_minutes: 480, ...extra,
});

describe("Google script — foreman minimum day", () => {
  it("tops a short day up to 8 h on its first job", () => {
    const [a] = run([[row("a", "08:00", "11:00", "3h00")]]);
    expect(a["Minimum 8 h (min)"]).toBe(300);
    expect(a["Heures payées"]).toBe("8h00");
  });

  it("recomputes when a later job of the day arrives in another batch", () => {
    const [a, b] = run([[row("a", "08:00", "11:00", "3h00")], [row("b", "13:00", "17:00", "4h00")]]);
    expect(a["Minimum 8 h (min)"]).toBe(60);
    expect(a["Heures payées"]).toBe("4h00");
    expect(b["Minimum 8 h (min)"]).toBe(0);
    expect(b["Heures payées"]).toBe("4h00");
  });

  it("moves the top-up to an earlier job exported afterwards", () => {
    const [late, early] = run([[row("late", "13:00", "16:00", "3h00")], [row("early", "07:00", "09:00", "2h00")]]);
    expect(late["Minimum 8 h (min)"]).toBe(0);
    expect(early["Minimum 8 h (min)"]).toBe(180);
    expect(early["Heures payées"]).toBe("5h00");
  });

  it("adds nothing at 8 h or more, on a non-weekday, or for other employees", () => {
    const rows = run([[
      row("a", "06:00", "15:00", "9h00"),
      row("b", "08:00", "10:00", "2h00", { job_date: "2026-11-07", employee_day_minimum_minutes: 0 }),
      row("c", "08:00", "10:00", "2h00", { employee_name: "Luc", employee_email: "l@x.test", employee_day_minimum_minutes: 0 }),
    ]]);
    expect(rows.map((r) => r["Minimum 8 h (min)"])).toEqual([0, 0, 0]);
    expect(rows[2]["Heures payées"]).toBe("2h00");
  });
});
