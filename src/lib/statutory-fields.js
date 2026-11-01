import { bracketConstants } from "@/payroll/rules/rule-overrides";

// The fields of one yearly scale, in the order the screen shows them. kind: "money" (dollars), "pct"
// (stored as a fraction, typed as a percentage) or "plain" (a number as stored).
const money = (path) => ({ path, kind: "money" });
const pct = (path) => ({ path, kind: "pct" });
const plain = (path) => ({ path, kind: "plain" });

export const STATUTORY_GROUPS = Object.freeze([
  { id: "rrq", fields: [money("rrq.ympe"), money("rrq.basicExemption"),
    pct("rrq.tier1.employeeRate"), pct("rrq.tier1.employerRate"), pct("rrq.tier1.baseRate"),
    money("rrq.tier1.employeeMaximum"), money("rrq.tier1.employerMaximum"), money("rrq.tier1.baseMaximum"),
    money("rrq.tier2.lowerLimit"), money("rrq.tier2.upperLimit"), pct("rrq.tier2.employeeRate"), pct("rrq.tier2.employerRate"),
    money("rrq.tier2.employeeMaximum"), money("rrq.tier2.employerMaximum")] },
  { id: "ei", fields: [money("ei.maxInsurableEarnings"), pct("ei.employeeRate"), pct("ei.employerRate"), money("ei.employeeMaximum"), money("ei.employerMaximum")] },
  { id: "rqap", fields: [money("rqap.maxInsurableEarnings"), pct("rqap.employeeRate"), pct("rqap.employerRate"), money("rqap.employeeMaximum"), money("rqap.employerMaximum")] },
  { id: "federalTax", brackets: "federalTax.brackets", fields: [pct("federalTax.lowestRate"), money("federalTax.basicPersonalAmount"), money("federalTax.canadaEmploymentAmount"), pct("federalTax.quebecAbatement")] },
  { id: "quebecTax", brackets: "quebecTax.brackets", fields: [pct("quebecTax.lowestRate"), money("quebecTax.basicPersonalAmount"), money("quebecTax.workerDeduction")] },
  { id: "fss", fields: [
    money("fss.general.lowPayrollThreshold"), money("fss.general.highPayrollThreshold"), pct("fss.general.lowRate"), pct("fss.general.highRate"), plain("fss.general.slideBase"), plain("fss.general.slideFactor"),
    money("fss.primary_manufacturing.lowPayrollThreshold"), money("fss.primary_manufacturing.highPayrollThreshold"), pct("fss.primary_manufacturing.lowRate"), pct("fss.primary_manufacturing.highRate"), plain("fss.primary_manufacturing.slideBase"), plain("fss.primary_manufacturing.slideFactor"),
    pct("fss.public.flatRate")] },
  { id: "labourStandards", fields: [pct("labourStandards.rate"), money("labourStandards.maxAssessablePerEmployee")] },
  { id: "workforceFund", fields: [money("workforceFund.payrollThreshold"), pct("workforceFund.rate")] },
]);

export const STATUTORY_FIELDS = Object.freeze(STATUTORY_GROUPS.flatMap((g) => g.fields));

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
function set(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// Stored number ↔ text typed by the owner (decimal comma; percentages as 6,3 for 0.063).
export function valueToText(value, kind) {
  if (value == null || !Number.isFinite(value)) return "";
  const n = kind === "pct" ? Math.round(value * 1e7) / 1e5 : value;
  return String(n).replace(".", ",");
}

export function textToValue(text, kind) {
  const s = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return kind === "pct" ? Math.round(n * 1e5) / 1e7 : n;
}

// Every editable text of a scale: scalar fields by path, brackets as `<section>.brackets.<i>.<upTo|rate|K>`.
export function dataToTexts(data) {
  const texts = {};
  for (const f of STATUTORY_FIELDS) texts[f.path] = valueToText(get(data, f.path), f.kind);
  for (const g of STATUTORY_GROUPS) {
    if (!g.brackets) continue;
    get(data, g.brackets).forEach((b, i) => {
      if (b.upTo != null) texts[`${g.brackets}.${i}.upTo`] = valueToText(b.upTo, "money");
      texts[`${g.brackets}.${i}.rate`] = valueToText(b.rate, "pct");
      texts[`${g.brackets}.${i}.K`] = valueToText(b.K, "money");
    });
  }
  return texts;
}

// The scale described by `texts`, shaped like `shape` (the base scale; the bracket count is kept). An unreadable
// text becomes NaN, which validateRuleData reports.
export function textsToData(texts, shape) {
  const data = JSON.parse(JSON.stringify(shape));
  for (const f of STATUTORY_FIELDS) set(data, f.path, textToValue(texts[f.path], f.kind));
  for (const g of STATUTORY_GROUPS) {
    if (!g.brackets) continue;
    const list = get(data, g.brackets);
    list.forEach((b, i) => {
      const last = i === list.length - 1;
      b.upTo = last ? null : textToValue(texts[`${g.brackets}.${i}.upTo`], "money");
      b.rate = textToValue(texts[`${g.brackets}.${i}.rate`], "pct");
      b.K = textToValue(texts[`${g.brackets}.${i}.K`], "money");
    });
  }
  return data;
}

// Fill each bracket's K from the thresholds and rates (rounded to the dollar, as the official tables).
export function recomputeBracketConstants(texts, shape, brackets) {
  const list = get(shape, brackets).map((_, i, arr) => ({
    upTo: i === arr.length - 1 ? 0 : textToValue(texts[`${brackets}.${i}.upTo`], "money"),
    rate: textToValue(texts[`${brackets}.${i}.rate`], "pct"),
  }));
  const ks = bracketConstants(list);
  const next = { ...texts };
  ks.forEach((k, i) => { next[`${brackets}.${i}.K`] = Number.isFinite(k) ? String(Math.round(k)) : ""; });
  return next;
}

// Differences between two scales (serialized): [{ path, kind, from, to }].
export function diffRuleData(from, to) {
  const rows = [];
  for (const f of STATUTORY_FIELDS) {
    const a = get(from, f.path); const b = get(to, f.path);
    if (a !== b) rows.push({ path: f.path, kind: f.kind, from: a, to: b });
  }
  for (const g of STATUTORY_GROUPS) {
    if (!g.brackets) continue;
    const listA = get(from, g.brackets) || []; const listB = get(to, g.brackets) || [];
    listB.forEach((b, i) => {
      for (const key of ["upTo", "rate", "K"]) {
        const a = listA[i]?.[key];
        if (a !== b[key]) rows.push({ path: `${g.brackets}.${i}.${key}`, kind: key === "rate" ? "pct" : "money", from: a, to: b[key] });
      }
    });
  }
  return rows;
}
