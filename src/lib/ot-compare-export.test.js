import { describe, expect, it } from "vitest";
import { COMPARISON_WIDTHS, comparisonFileName, comparisonTable } from "./ot-compare-export";

const labels = {
  "ocr.col.date": "Date", "ocr.col.employee": "Employé", "ocr.col.jobOt": "OT", "ocr.col.result": "Résultat", "otc.col.note": "Note Britton",
  "otc.col.client": "Chez le client", "otc.col.return": "Retour", "otc.src.britton": "Britton", "otc.src.proof": "Preuve de temps", "otc.src.sheet": "Fiche de travail",
  "otc.verdict.brittonGap": "Britton diffère", "otc.verdict.ok": "Tout concorde", "otc.verdict.missingSparklog": "Pas dans Sparklog",
};
const t = (key) => labels[key] || key;

const entry = (extra = {}) => ({
  jobDate: "2026-11-19", name: "Anthony Fortin", jobOt: "OT-211794", ot: "211794", verdict: "brittonGap", britton: { note: "à vérifier" },
  brittonValues: { client: 60, return: 15 }, form: { client: 120, return: 15 }, sparklog: { client: 120, return: 10 },
  red: { britton: new Set(["client"]), form: new Set(), sparklog: new Set(["return"]) }, ...extra,
});

describe("comparisonTable", () => {
  it("groups the columns by what they measure: at the client (Britton, proof, work sheet) then return (same order)", () => {
    const { header, rows } = comparisonTable([entry()], t);
    expect(header).toEqual([
      "Date", "Employé", "OT",
      "Chez le client – Britton", "Chez le client – Preuve de temps", "Chez le client – Fiche de travail",
      "Retour – Britton", "Retour – Preuve de temps", "Retour – Fiche de travail",
      "Résultat", "Note Britton",
    ]);
    expect(header).toHaveLength(COMPARISON_WIDTHS.length);
    expect(rows[0]).toEqual([
      "2026-11-19", "Anthony Fortin", "OT-211794",
      { v: 60, style: "red" }, 120, 120, // client: Britton (odd, red) → proof → work sheet
      15, 15, { v: 10, style: "red" }, // return: Britton → proof → work sheet (odd, red)
      "Britton diffère", "à vérifier",
    ]);
  });

  it("leaves a missing source empty (never a zero) and a Britton-only line without work sheet", () => {
    const { rows } = comparisonTable([entry({ verdict: "missingSparklog", job: null, jobOt: "", form: null, sparklog: null, red: { britton: new Set(), form: new Set(), sparklog: new Set() }, britton: { note: null } })], t);
    expect(rows[0]).toEqual(["2026-11-19", "Anthony Fortin", "211794", 60, "", "", 15, "", "", "Pas dans Sparklog", ""]);
  });
});

describe("comparisonFileName", () => {
  it("names the file after the days of the rows", () => {
    expect(comparisonFileName([{ jobDate: "2026-11-20" }, { jobDate: "2026-11-16" }, { jobDate: "2026-11-16" }])).toBe("comparaison temps supp 2026-11-16 au 2026-11-20.xlsx");
    expect(comparisonFileName([{ jobDate: "2026-11-19" }])).toBe("comparaison temps supp 2026-11-19.xlsx");
    expect(comparisonFileName([])).toBe("comparaison temps supp.xlsx");
  });
});
