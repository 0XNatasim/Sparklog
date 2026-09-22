// Parse a CCQ-style pay-stub PDF (page 2/2 "Sommaire") into YTD opening balances.
//
// The stub is a GENERATED PDF (real text layer), so we read the text WITH COORDINATES via
// pdf.js — fully client-side (the sensitive stub never leaves the browser) and far more
// reliable than image OCR for a two-column table. We reconstruct rows by y, split each row
// into (label → numbers) runs by x, take the CUMULATIF (rightmost number of each run), and
// map French labels to our YTD state keys. Best-effort: the caller PRE-FILLS the fields for
// manual review — never auto-saves.
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();

// A token is a number if it is only digits/commas/dots/spaces and has a digit.
function toNumber(tok) {
  const s = String(tok).trim();
  if (!/^-?[\d.,\s]+$/.test(s)) return null;
  if (!/\d/.test(s)) return null;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ""); // "38,453.73" → "38453.73"
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

// Ordered most-specific first. `match`: the run label (normalized) must include this text.
// `exact`: require an exact normalized-label match (avoids "heures" ⊂ "heures ae", etc.).
const LABELS = [
  { key: "ccqTaxableBenefit", match: "avantage imposable additionnel ccq" },
  { key: "ccqBenefitsDeduction", match: "avantages sociaux ccq (deduction)" },
  { key: "ccqBenefitsAdvantage", match: "avantages sociaux ccq (avantage)" },
  { key: "regularEarnings", match: "salaire regulier" },
  { key: "doubleTime", match: "temps double" },
  { key: "vacancesCcq", match: "vacances ccq" },
  { key: "ccqLevy", match: "prelevement ccq" },
  { key: "unionDues", match: "cot. syndic" },
  { key: "unionDues", match: "cotisation syndicale" },
  { key: "unionEducationFund", match: "caisse d'education syndicale" },
  { key: "safetyEquipment", match: "equipement de securite" },
  { key: "insuranceSalesTax", match: "taxe de vente assurance" },
  { key: "medicInsurance", match: "assurance medic" },
  { key: "quebecTax", match: "impot quebec" },
  { key: "federalTax", match: "impot federal" },
  { key: "eiEmployee", match: "contr. a ae" },
  { key: "eiEmployee", match: "contr a ae" },
  { key: "rrqEmployee", match: "contr. au rrq" },
  { key: "rqapEmployee", match: "contr. au rqap" },
  { key: "insurableIncomeEI", match: "gains ae" },
  { key: "pensionableIncomeRRQ", match: "gains rrq" },
  { key: "insurableIncomeRQAP", match: "gains rqap" },
  { key: "kmIndemnity", match: "indemnite km" },
  { key: "otherIncome", match: "autre revenu" },
  { key: "vacationPay", match: "vacances", exact: true },
  { key: "hoursYtd", match: "heures", exact: true },
];

// Extract positioned text items from every page of the PDF.
async function readItems(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      const str = (it.str || "").trim();
      if (!str) continue;
      items.push({ str, x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return items;
}

// Group items into visual rows (same page, y within a tolerance), each sorted left→right.
function toRows(items) {
  const rows = [];
  for (const it of items) {
    let row = rows.find((r) => r.page === it.page && Math.abs(r.y - it.y) <= 3);
    if (!row) { row = { page: it.page, y: it.y, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => (a.page - b.page) || (b.y - a.y));
  return rows;
}

// Split one row into (label, numbers) runs. A run = text fragments followed by the numbers
// that belong to them; the two-column summary yields ~two runs per row.
function rowRuns(row) {
  const runs = [];
  let label = [], nums = [], labelX = null;
  const flush = () => {
    if (label.length && nums.length) runs.push({ label: label.join(" "), labelNorm: norm(label.join(" ")), nums: nums.slice(), x: labelX });
    label = []; nums = []; labelX = null;
  };
  for (const it of row.items) {
    const v = toNumber(it.str);
    if (v !== null) {
      nums.push(v);
    } else {
      if (nums.length) flush(); // a new label starts after a number run
      if (labelX == null) labelX = it.x;
      label.push(it.str);
    }
  }
  flush();
  return runs;
}

// Parse the stub → { ytd: {stateKey: dollars}, matched: [{label, key, value}], asOf, rows }.
export async function parsePayStubPdf(file) {
  const items = await readItems(file);
  if (!items.length) {
    const err = new Error("no_text_layer");
    err.code = "no_text_layer";
    throw err;
  }
  const rows = toRows(items);
  const runs = [];
  for (const row of rows) for (const run of rowRuns(row)) runs.push(run);

  const ytd = {};
  const matched = [];
  const usedRuns = new Set();

  // "Avantages sociaux CCQ" often wraps the "(Déduction)"/"(Avantage)" to the next line, so
  // both blocks read the same on line 1. Disambiguate by column x: left = déduction, right = avantage.
  const asRuns = runs.filter((r) => r.labelNorm.startsWith("avantages sociaux ccq") && !/deduc|avan/.test(r.labelNorm));
  if (asRuns.length === 2) {
    const [left, right] = [...asRuns].sort((a, b) => a.x - b.x);
    ytd.ccqBenefitsDeduction = left.nums[left.nums.length - 1];
    ytd.ccqBenefitsAdvantage = right.nums[right.nums.length - 1];
    matched.push({ label: "Avantages sociaux CCQ (Déduction)", key: "ccqBenefitsDeduction", value: ytd.ccqBenefitsDeduction });
    matched.push({ label: "Avantages sociaux CCQ (Avantage)", key: "ccqBenefitsAdvantage", value: ytd.ccqBenefitsAdvantage });
    usedRuns.add(left); usedRuns.add(right);
  }

  for (const def of LABELS) {
    if (ytd[def.key] != null) continue; // already filled (e.g. by the special case)
    const candidates = runs.filter((r) => !usedRuns.has(r) && (def.exact ? r.labelNorm === def.match : r.labelNorm.includes(def.match)));
    if (!candidates.length) continue;
    // Several columns share a row: the left "Transactions" block repeats some labels
    // ("Temps double", "Équipement de sécurité", "Salaire régulier"…). The rightmost
    // match is the "Sommaire" occurrence, whose last number is the true Cumulatif.
    const run = candidates.reduce((best, r) => (r.x > best.x ? r : best));
    const cumul = run.nums[run.nums.length - 1];
    if (cumul == null) continue;
    ytd[def.key] = cumul;
    usedRuns.add(run);
    matched.push({ label: run.label, key: def.key, value: cumul });
  }

  // Pay-period end (as-of date for the seed): "Période de paie … au YYYY-MM-DD".
  const allText = rows.map((r) => r.items.map((i) => i.str).join(" ")).join("\n");
  const auMatch = allText.match(/au\s+(\d{4}-\d{2}-\d{2})/i);
  const asOf = auMatch ? auMatch[1] : "";

  return { ytd, matched, asOf };
}
