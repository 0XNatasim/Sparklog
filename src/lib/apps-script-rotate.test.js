import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../supabase/functions/push_approved_batch/apps-script-rotate-year.js", import.meta.url), "utf8");

describe("Google Sheet yearly rotation script (pasted by hand in Apps Script)", () => {
  it("is valid JavaScript", () => {
    expect(() => new Function(src)).not.toThrow();
  });

  it("never deletes or empties the current sheet: it copies first and only edits the copy", () => {
    expect(src).toContain("makeCopy(");
    const afterCopy = src.slice(src.indexOf("makeCopy("));
    expect(afterCopy).toContain("copy.deleteSheet");
    expect(src).not.toMatch(/source\.(deleteSheet|deleteRows|clear|setTrashed)/);
    expect(src).not.toContain("setTrashed");
  });

  it("only removes weekly tabs named SemXX and asks before doing anything", () => {
    expect(src).toContain("/^Sem\\d+$/");
    expect(src).toContain("ui.ButtonSet.OK_CANCEL");
  });

  it("keeps the master tab name the export script writes to", () => {
    const doPost = readFileSync(new URL("../../supabase/functions/push_approved_batch/apps-script-doPost.js", import.meta.url), "utf8");
    expect(doPost).toContain('getSheetByName("Data")');
    expect(src).toContain('getSheetByName("Data")');
  });
});
