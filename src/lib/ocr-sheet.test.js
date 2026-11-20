import { describe, expect, it } from "vitest";
import { hasReturn, jobKilometres, proofCompareLines, proofSheetLines } from "./ocr-sheet";

const t = (key) => key;
const base = { ot: "202765", status: "submitted", depart: "13:45:00", arrivee: "14:10:00", fin: "16:45:00", return_time_minutes: 0, km_total: 12, km_aller: 12, km_retour: 0 };
const row = (job, extra = {}) => ({ job, found: { ot: "202765", clientMinutes: 90, returnMinutes: 15 }, expected: { clientMinutes: 100, returnMinutes: 0 }, wrong: new Set(["client"]), ...extra });

describe("ocr-sheet", () => {
  it("shows start → arrival → end and no return when none was declared", () => {
    const lines = proofSheetLines(row(base), t);
    expect(lines.find((l) => l.key === "hours").value).toBe("13:45 → 14:10 → 16:45");
    expect(lines.some((l) => l.key === "return" || l.key === "kmBack")).toBe(false);
    expect(lines.find((l) => l.key === "km").value).toBe("12 km");
  });
  it("adds the return minutes and the return kilometres when there is a return", () => {
    const lines = proofSheetLines(row({ ...base, return_time_minutes: 15, km_retour: 8, km_total: 20, km_aller: 12 }), t);
    expect(lines.find((l) => l.key === "return").value).toBe("15 min");
    expect(lines.find((l) => l.key === "kmOut").value).toBe("12 km");
    expect(lines.find((l) => l.key === "kmBack").value).toBe("8 km");
    expect(lines.find((l) => l.key === "km").value).toBe("20 km");
  });
  it("counts a return declared by kilometres only, and sums the total when it is missing", () => {
    expect(hasReturn({ return_time_minutes: 0, km_retour: 5 })).toBe(true);
    expect(hasReturn({ return_time_minutes: 0, km_retour: 0 })).toBe(false);
    expect(jobKilometres({ km_total: null, km_aller: 3, km_retour: 4 }).total).toBe(7);
    expect(jobKilometres({}).total).toBeNull();
  });
  it("has no sheet without a job, and flags the gaps of the comparison", () => {
    expect(proofSheetLines(row(null), t)).toEqual([]);
    const cmp = proofCompareLines(row(base), t);
    expect(cmp.find((l) => l.key === "cmpClient")).toMatchObject({ value: "90 min / 100 min", bad: true });
    expect(cmp.find((l) => l.key === "cmpOt").bad).toBe(false);
  });
});
