// The comparison table (Britton · proof · work sheet) as the rows of a spreadsheet, columns grouped by what they measure:
// « chez le client » (Britton → preuve de temps → fiche de travail) then « retour » (same order). No picture, no proof file.
// `entries` = rows of buildOtComparison (already filtered); `t` = the i18n function.
const SOURCES = [["britton", "otc.src.britton"], ["form", "otc.src.proof"], ["sparklog", "otc.src.sheet"]];
const FIELDS = [["client", "otc.col.client"], ["return", "otc.col.return"]];

// The remark of an entry as a sentence (`t` = i18n function), or "".
export function remarkText(entry, t) {
  const r = entry?.remark;
  if (!r) return "";
  if (r.kind === "earlier") return t("otc.remark.earlier", { n: r.days });
  if (r.kind === "otOtherDay") return t("otc.remark.otOtherDay", { date: r.day });
  if (r.kind === "wrongOt") return t("otc.remark.wrongOt", { ots: r.ots.join(", ") });
  if (r.kind === "brittonOt") return t("otc.remark.brittonOt", { ots: r.ots.join(", ") });
  if (r.kind === "noSheet") return t("otc.remark.noSheet");
  return "";
}

// Row colour in the file: pale green = everything agrees, pale orange = every source is there but one differs; the others stay plain.
export const VERDICT_FILLS = { ok: "green", brittonGap: "orange", formGap: "orange" };

// The file has a two-line header so the columns stay narrow: line 1 = « Chez le client » / « Retour » over three columns each, line 2 =
// Britton · Preuve de temps · Fiche de travail (which wraps on two lines); the other columns span both lines.
// { headers: [line1, line2], merges: ["A1:A2", "D1:F1", …], rows: cell[][], fills } where a cell is a number, a string, "" or { v, style: "red" } (the odd figure).
export function comparisonTable(entries, t) {
  const solo = [t("ocr.col.date"), t("ocr.col.employee"), t("ocr.col.jobOt")];
  const top = [...solo];
  const bottom = ["", "", ""];
  for (const [, fieldKey] of FIELDS) {
    SOURCES.forEach(([, sourceKey], index) => { top.push(index === 0 ? t(fieldKey) : ""); bottom.push(t(sourceKey)); });
  }
  top.push(t("ocr.col.result"), t("otc.col.remark"), t("otc.col.note"));
  bottom.push("", "", "");
  const merges = ["A1:A2", "B1:B2", "C1:C2", "D1:F1", "G1:I1", "J1:J2", "K1:K2", "L1:L2"];
  const rows = (entries || []).map((entry) => {
    // Not at Britton (no line for this OT): the OT is in red; the name is green when the person IS in Britton's table around
    // that day (so the OT is probably the wrong one) and red when the person is not there at all.
    const missing = entry.verdict === "missingBritton";
    const flag = (value, style) => (missing && value !== "" ? { v: value, style } : value);
    const row = [entry.jobDate, flag(entry.name || "", entry.personInBritton ? "green" : "red"), flag(entry.jobOt || entry.ot || "", "red")];
    for (const [field] of FIELDS) {
      for (const [source] of SOURCES) {
        const values = source === "britton" ? entry.brittonValues : entry[source];
        const value = values ? values[field] : null;
        // The old way (screenshot of the approval text message): « SMS » where the proof's minutes would be.
        const number = value === null || value === undefined ? (source === "form" && (entry.proofs || []).some((proof) => proof.state === "sms") ? "SMS" : "") : value;
        // The odd figure is red; when everything agrees (« ok », pale green row) the figures are green.
        row.push(number === "" ? number : entry.red?.[source]?.has(field) ? { v: number, style: "red" } : entry.verdict === "ok" ? { v: number, style: "green" } : number);
      }
    }
    row.push(t(`otc.verdict.${entry.verdict}`), remarkText(entry, t), entry.britton?.note || "");
    return row;
  });
  return { headers: [top, bottom], merges, rows, fills: (entries || []).map((entry) => VERDICT_FILLS[entry.verdict] || null) };
}

// Narrow columns: the figures take 10 characters, the header lines above them wrap.
// Row heights (points) of the two header lines: the second wraps « Preuve de temps » / « Fiche de travail » on two lines.
export const COMPARISON_HEADER_HEIGHTS = { 0: 20, 1: 32 };
export const COMPARISON_WIDTHS = [11, 22, 10, 10, 10, 10, 10, 10, 10, 17, 36, 24];

// « comparaison temps supp 2026-11-16 au 2026-11-20.xlsx » (the days of the rows), or the day alone.
export function comparisonFileName(entries) {
  const days = [...new Set((entries || []).map((entry) => entry.jobDate).filter(Boolean))].sort();
  const span = days.length === 0 ? "" : days.length === 1 ? ` ${days[0]}` : ` ${days[0]} au ${days[days.length - 1]}`;
  return `comparaison temps supp${span}.xlsx`;
}
