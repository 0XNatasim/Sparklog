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

// { header: string[], rows: cell[][] } where a cell is a number, a string, "" or { v, style: "red" } (the odd figure).
export function comparisonTable(entries, t) {
  const header = [t("ocr.col.date"), t("ocr.col.employee"), t("ocr.col.jobOt")];
  for (const [, fieldKey] of FIELDS) for (const [, sourceKey] of SOURCES) header.push(`${t(fieldKey)} – ${t(sourceKey)}`);
  header.push(t("ocr.col.result"), t("otc.col.remark"), t("otc.col.note"));
  const rows = (entries || []).map((entry) => {
    const row = [entry.jobDate, entry.name || "", entry.jobOt || entry.ot || ""];
    for (const [field] of FIELDS) {
      for (const [source] of SOURCES) {
        const values = source === "britton" ? entry.brittonValues : entry[source];
        const value = values ? values[field] : null;
        const number = value === null || value === undefined ? "" : value;
        row.push(entry.red?.[source]?.has(field) && number !== "" ? { v: number, style: "red" } : number);
      }
    }
    row.push(t(`otc.verdict.${entry.verdict}`), remarkText(entry, t), entry.britton?.note || "");
    return row;
  });
  return { header, rows, fills: (entries || []).map((entry) => VERDICT_FILLS[entry.verdict] || null) };
}

export const COMPARISON_WIDTHS = [12, 26, 11, 16, 20, 18, 14, 20, 18, 20, 44, 30];

// « comparaison temps supp 2026-11-16 au 2026-11-20.xlsx » (the days of the rows), or the day alone.
export function comparisonFileName(entries) {
  const days = [...new Set((entries || []).map((entry) => entry.jobDate).filter(Boolean))].sort();
  const span = days.length === 0 ? "" : days.length === 1 ? ` ${days[0]}` : ` ${days[0]} au ${days[days.length - 1]}`;
  return `comparaison temps supp${span}.xlsx`;
}
