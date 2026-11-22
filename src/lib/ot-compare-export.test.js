import { describe, expect, it } from "vitest";
import { COMPARISON_WIDTHS, comparisonFileName, comparisonTable, remarkText } from "./ot-compare-export";

const labels = {
  "ocr.col.date": "Date", "ocr.col.employee": "Employé", "ocr.col.jobOt": "OT", "ocr.col.result": "Résultat", "otc.col.note": "Note Britton", "otc.col.remark": "Remarque",
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
  it("has a two-line header (narrow columns): « Chez le client » / « Retour » over Britton · Preuve de temps · Fiche de travail, the others spanning both lines", () => {
    const { headers, merges, rows } = comparisonTable([entry()], t);
    expect(headers[0]).toEqual(["Date", "Employé", "OT", "Chez le client", "", "", "Retour", "", "", "Résultat", "Remarque", "Note Britton"]);
    expect(headers[1]).toEqual(["", "", "", "Britton", "Preuve de temps", "Fiche de travail", "Britton", "Preuve de temps", "Fiche de travail", "", "", ""]);
    expect(merges).toEqual(["A1:A2", "B1:B2", "C1:C2", "D1:F1", "G1:I1", "J1:J2", "K1:K2", "L1:L2"]);
    expect(headers[0]).toHaveLength(COMPARISON_WIDTHS.length);
    expect(rows[0]).toEqual([
      "2026-11-19", "Anthony Fortin", "OT-211794",
      { v: 60, style: "red" }, 120, 120, // client: Britton (odd, red) → proof → work sheet
      15, 15, { v: 10, style: "red" }, // return: Britton → proof → work sheet (odd, red)
      "Britton diffère", "", "à vérifier",
    ]);
  });

  it("leaves a missing source empty (never a zero) and a Britton-only line without work sheet", () => {
    const { rows } = comparisonTable([entry({ verdict: "missingSparklog", job: null, jobOt: "", form: null, sparklog: null, red: { britton: new Set(), form: new Set(), sparklog: new Set() }, britton: { note: null } })], t);
    expect(rows[0]).toEqual(["2026-11-19", "Anthony Fortin", "211794", 60, "", "", 15, "", "", "Pas dans Sparklog", "", ""]);
  });
});

describe("not at Britton", () => {
  it("puts the OT in red when Britton has no line for the work order; the name is green if the person is in Britton's table, red if not; only then", () => {
    const missing = comparisonTable([entry({ verdict: "missingBritton", britton: null, brittonValues: null })], t).rows[0];
    expect(missing.slice(0, 3)).toEqual(["2026-11-19", { v: "Anthony Fortin", style: "red" }, { v: "OT-211794", style: "red" }]);
    const inBritton = comparisonTable([entry({ verdict: "missingBritton", britton: null, brittonValues: null, personInBritton: true })], t).rows[0];
    expect(inBritton.slice(0, 3)).toEqual(["2026-11-19", { v: "Anthony Fortin", style: "green" }, { v: "OT-211794", style: "red" }]);
    const gap = comparisonTable([entry({ verdict: "brittonGap" })], t).rows[0];
    expect(gap.slice(0, 3)).toEqual(["2026-11-19", "Anthony Fortin", "OT-211794"]);
  });
});

describe("name and OT that are good", () => {
  it("writes the name and the OT in green when Britton has a line for the work order, whatever the verdict (ok, gap, no proof)", () => {
    for (const verdict of ["ok", "brittonGap", "formGap", "noProof"]) {
      const row = comparisonTable([entry({ verdict, job: { id: "j1" } })], t).rows[0];
      expect(row.slice(1, 3)).toEqual([{ v: "Anthony Fortin", style: "green" }, { v: "OT-211794", style: "green" }]);
    }
    // a Britton line with no work sheet: left plain
    const alone = comparisonTable([entry({ verdict: "missingSparklog", job: null })], t).rows[0];
    expect(alone.slice(1, 3)).toEqual(["Anthony Fortin", "OT-211794"]);
  });
});

describe("everything agrees", () => {
  it("writes the figures in green (not the empty cells) when the verdict is « ok »; the other verdicts keep plain figures", () => {
    const ok = comparisonTable([entry({ verdict: "ok", brittonValues: { client: 120, return: 0 }, form: null, sparklog: { client: 120, return: 0 }, red: { britton: new Set(), form: new Set(), sparklog: new Set() } })], t).rows[0];
    expect(ok.slice(3, 9)).toEqual([{ v: 120, style: "green" }, "", { v: 120, style: "green" }, { v: 0, style: "green" }, "", { v: 0, style: "green" }]);
    const gap = comparisonTable([entry({ verdict: "noProof", red: { britton: new Set(), form: new Set(), sparklog: new Set() } })], t).rows[0];
    expect(gap[3]).toBe(60);
  });
});

describe("SMS proof", () => {
  it("writes « SMS » in the proof columns when the proof is the screenshot of the approval text message", () => {
    const row = comparisonTable([entry({ form: null, proofs: [{ state: "sms" }] })], t).rows[0];
    expect(row[4]).toBe("SMS"); // at the client · proof
    expect(row[7]).toBe("SMS"); // return · proof
    expect(comparisonTable([entry({ form: null, proofs: [] })], t).rows[0][4]).toBe("");
  });
});

describe("row colours", () => {
  it("pale green when everything agrees, pale orange when every source is there but one differs, nothing otherwise", () => {
    const { fills } = comparisonTable([entry({ verdict: "ok" }), entry({ verdict: "brittonGap" }), entry({ verdict: "formGap" }), entry({ verdict: "missingSparklog" }), entry({ verdict: "noProof" })], t);
    expect(fills).toEqual(["green", "orange", "orange", null, null]);
  });
});

describe("remarkText", () => {
  it("writes the remark as a sentence and a column of the file", () => {
    const words = (key, vars = {}) => `${key}:${Object.values(vars).join("|")}`;
    expect(remarkText({ remark: { kind: "earlier", days: 1 } }, words)).toBe("otc.remark.earlier:1");
    expect(remarkText({ remark: { kind: "wrongOt", ots: ["OT-1", "OT-2"] } }, words)).toBe("otc.remark.wrongOt:OT-1, OT-2");
    expect(remarkText({}, words)).toBe("");
    const { rows } = comparisonTable([entry({ remark: { kind: "earlier", days: 1 } })], (key, vars) => (key === "otc.remark.earlier" ? `avant ${vars.n}` : labels[key] || key));
    expect(rows[0][10]).toBe("avant 1");
  });
});

describe("comparisonFileName", () => {
  it("names the file after the days of the rows", () => {
    expect(comparisonFileName([{ jobDate: "2026-11-20" }, { jobDate: "2026-11-16" }, { jobDate: "2026-11-16" }])).toBe("comparaison temps supp 2026-11-16 au 2026-11-20.xlsx");
    expect(comparisonFileName([{ jobDate: "2026-11-19" }])).toBe("comparaison temps supp 2026-11-19.xlsx");
    expect(comparisonFileName([])).toBe("comparaison temps supp.xlsx");
  });
});
