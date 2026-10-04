// Pure talon-import parsing (no pdf.js) so it is unit-testable and shared.
const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function toNumber(tok) {
  const s = String(tok).trim().replace(/\$/g, "");
  if (!/^-?[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null;
  const v = Number(s.replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

// Column x-bands for the legacy layout (points). [labelMin,labelMax, n1Min,n1Max, n2Min,n2Max].
const BLOCKS = {
  // Generous bands: stubs re-printed through « Microsoft Print To PDF » (D0035-0001) sit ~5 pt further left than
  // the originals, and right-aligned numbers start further left the wider they are.
  transactions: { label: [20, 105], nums: [[105, 148], [148, 190], [190, 235]] }, // Unité, Taux, Montant
  sommaireMid: { label: [220, 300], nums: [[300, 345], [345, 395]] }, // Période, Cumulatif
  sommaireRight: { label: [395, 470], nums: [[470, 522], [522, 620]] }, // Période, Cumulatif
};

const inBand = (x, [a, b]) => x >= a && x < b;

// Canonical Sommaire labels (typo-tolerant) → { label, key } where key is a ledger stateKey.
// `re` is tested against the normalized parsed label (which may be truncated to its first line).
const SOMMAIRE_CANON = [
  { re: /^salaire regulier/, key: "regularEarnings", label: "Salaire régulier" },
  { re: /^temps double/, key: "doubleTime", label: "Temps double" },
  { re: /^vacances ccq/, key: "vacancesCcq", label: "Vacances CCQ" },
  { re: /^vacances$/, key: "vacationPay", label: "Vacances" },
  { re: /^prelevement ccq/, key: "ccqLevy", label: "Prélèvement CCQ" },
  { re: /^cot\.? syndic/, key: "unionDues", label: "Cotisation syndicale" },
  { re: /caisse d'?education/, key: "unionEducationFund", label: "Caisse d'éducation syndicale" },
  { re: /^avantages sociaux.*(avantage)/, key: "ccqBenefitsAdvantage", label: "Avantages sociaux CCQ (Avantage)" },
  { re: /^avantages sociaux/, key: "ccqBenefitsDeduction", label: "Avantages sociaux CCQ (Déduction)" }, // resolved by x below
  { re: /^avantage imposable/, key: "ccqTaxableBenefit", label: "Avantage imposable additionnel CCQ" },
  { re: /^equipement de/, key: "safetyEquipment", label: "Équipement de sécurité" },
  { re: /^assurance medic/, key: "medicInsurance", label: "Assurance MÉDIC" },
  { re: /^taxe de vente/, key: "insuranceSalesTax", label: "Taxe de vente assurance" },
  { re: /^impot quebec/, key: "quebecTax", label: "Impôt Québec" },
  { re: /^impot federal/, key: "federalTax", label: "Impôt Fédéral" },
  { re: /^contr.* ae/, key: "eiEmployee", label: "Contr. à AE" },
  { re: /^contr.* rrq/, key: "rrqEmployee", label: "Contr. au RRQ" },
  { re: /^contr.* rqap/, key: "rqapEmployee", label: "Contr. au RQAP" },
  { re: /^gains ae/, key: "insurableIncomeEI", label: "Gains AE" },
  { re: /^gains rrq/, key: "pensionableIncomeRRQ", label: "Gains RRQ" },
  { re: /^gains rqap/, key: "insurableIncomeRQAP", label: "Gains RQAP" },
  { re: /^heures ae/, key: null, label: "Heures AE" },
  { re: /^heures/, key: "hoursYtd", label: "Heures" },
  { re: /^autre revenu/, key: "otherIncome", label: "Autre Revenu 1" },
  { re: /^inde?mnite km|km -|km$/, key: "kmIndemnity", label: "Indemnité KM (utilisation véhicule personnel)" },
];

function canonicalize(rawLabel, block) {
  const n = norm(rawLabel);
  for (const c of SOMMAIRE_CANON) {
    if (c.re.test(n)) {
      // "Avantages sociaux" without (Avantage)/(Déduction): the RIGHT column is Avantage.
      if (c.key === "ccqBenefitsDeduction" && block === "sommaireRight" && !/deduc/.test(n)) {
        return { key: "ccqBenefitsAdvantage", label: "Avantages sociaux CCQ (Avantage)" };
      }
      return { key: c.key, label: c.label };
    }
  }
  return { key: null, label: rawLabel };
}

// Group a page's items into visual rows (top→bottom), each sorted left→right.
function toRows(items) {
  const rows = [];
  for (const it of items) {
    let r = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

// Rebuild one block's logical lines from the body rows.
function blockLines(rows, block, def) {
  const lines = [];
  let cur = null;
  for (const row of rows) {
    const cells = row.items.filter((it) => it.x >= def.label[0] && (def.nums.length ? it.x < def.nums[def.nums.length - 1][1] : true));
    if (!cells.length) continue;
    const labelFrags = [];
    const nums = def.nums.map(() => null);
    for (const it of cells) {
      const v = toNumber(it.s);
      if (v !== null) {
        let idx = def.nums.findIndex((band) => inBand(it.x, band));
        // Transactions: a printed rate always has four decimals (« 101.5800 ») and an amount a « $ »,
        // units two. A wide rate starts further left and lands in the Unité band (stub D0031-0008:
        // « Temps double » without units) — classify by format, not only by position.
        if (block === "transactions" && idx >= 0) {
          if (/\.\d{4}$/.test(it.s.trim())) idx = 1;
          else if (it.s.includes("$")) idx = 2;
        }
        if (idx >= 0) nums[idx] = v; else labelFrags.push(it.s);
      } else if (inBand(it.x, def.label)) {
        labelFrags.push(it.s);
      }
    }
    const hasNum = nums.some((v) => v !== null);
    if (hasNum) {
      cur = { rawLabel: labelFrags.join(" ").trim(), nums };
      lines.push(cur);
    } else if (labelFrags.length && cur) {
      cur.rawLabel = `${cur.rawLabel} ${labelFrags.join(" ")}`.trim();
    }
  }
  return lines;
}

// Pull one header value: the item just right of a label anchor on the same row.
function headerValue(rows, labelRe) {
  for (const row of rows) {
    const idx = row.items.findIndex((it) => labelRe.test(norm(it.s)));
    if (idx >= 0 && row.items[idx + 1]) return row.items[idx + 1].s;
  }
  return null;
}

// Paid hours of a talon = the units on the hour-based earnings lines only (régulier, temps et
// demi, temps double). "Régulier à taux horaire" is a premium computed ON the regular hours and
// the allowance/reimbursement lines are not hours, so none of them may add to the total.
const isPaidHoursLine = (description, taux, regularRate) => {
  const n = norm(description);
  if (/taux horaire/.test(n)) {
    // « Régulier à taux horaire » is the premium line (units = the regular hours, rate = the premium) EXCEPT when
    // it is paid at the regular rate itself (stub S39: 0,25 h × 50,79) — those are real hours.
    return regularRate != null && taux != null && Math.abs(taux - regularRate) < 0.005;
  }
  return /^(salaire )?regulier/.test(n) || /^temps (et demi|double|simple)/.test(n);
};

// The legacy software also counted the premium line's units, inflating "Heures" / "Heures AE"
// (e.g. 29.5 + 2 + 29.5 = 61 instead of 31.5). Rebuild the real hours from the Transactions block
// and take the excess off both the period and the cumulative columns. No-op when the legacy
// figure is already right, or when no hour line can be identified.
export function correctLegacyHours(transactions, sommaire, ytd) {
  const regularRate = (transactions.find((r) => /^(salaire )?regulier/.test(norm(r.description)) && !/taux horaire/.test(norm(r.description)) && r.taux != null) || {}).taux ?? null;
  const lines = transactions.filter((r) => r.unite != null && isPaidHoursLine(r.description, r.taux, regularRate));
  if (!lines.length) return null;
  const paidHours = Math.round(lines.reduce((sum, r) => sum + r.unite, 0) * 100) / 100;
  const legacy = sommaire.find((r) => r.key === "hoursYtd");
  if (!legacy || legacy.periode == null) return null;
  const legacyHours = legacy.periode;
  const excess = Math.round((legacyHours - paidHours) * 100) / 100;
  if (excess <= 0.005) return null;
  const fix = (v) => (v == null ? v : Math.round((v - excess) * 100) / 100);
  for (const row of sommaire) {
    if (row.key === "hoursYtd" || /^heures ae$/.test(norm(row.description))) {
      row.periode = fix(row.periode);
      row.cumulatif = fix(row.cumulatif);
    }
  }
  if (ytd.hoursYtd != null) ytd.hoursYtd = fix(ytd.hoursYtd);
  return { legacyHours, paidHours, excess };
}

// Cumulative hours of an imported week = the previous registry week's hours + this week's real
// hours (the legacy cumulative also carries every earlier week's premium-line excess, which only
// the current week's correction removes). Rewrites "Heures" and "Heures AE" (cumulatif) and the
// ledger snapshot; returns { previousHours, periodHours, total } or null when nothing applies.
export function chainHoursFromPrevious(talon, previousHoursYtd) {
  const prev = Number(previousHoursYtd);
  if (!Number.isFinite(prev)) return null;
  const hoursRow = (talon.sommaire || []).find((r) => r.key === "hoursYtd");
  if (!hoursRow || hoursRow.periode == null) return null;
  const total = Math.round((prev + hoursRow.periode) * 100) / 100;
  for (const row of talon.sommaire) {
    if (row.key === "hoursYtd" || /^heures ae$/.test(norm(row.description))) row.cumulatif = total;
  }
  talon.ytd = { ...(talon.ytd || {}), hoursYtd: total };
  return { previousHours: prev, periodHours: hoursRow.periode, total };
}

// Pure: rebuild the full talon from positioned items.
export function buildTalonFromItems(items) {
  // The talon lives on the page carrying the "Transactions"/"Sommaire" table.
  const byPage = new Map();
  for (const it of items) { if (!byPage.has(it.page)) byPage.set(it.page, []); byPage.get(it.page).push(it); }
  let pageItems = null;
  for (const [, list] of byPage) {
    if (list.some((it) => /transactions/i.test(it.s)) && list.some((it) => /sommaire/i.test(it.s))) { pageItems = list; break; }
  }
  if (!pageItems) pageItems = items;
  const rows = toRows(pageItems);
  const allText = rows.map((r) => r.items.map((i) => i.s).join(" ")).join("\n");

  // Body = rows below the "Description … Unité …" header row.
  const headerIdx = rows.findIndex((r) => /description/i.test(r.items.map((i) => i.s).join(" ")) && /unite|unité/i.test(r.items.map((i) => i.s).join(" ")));
  const bodyRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;

  const tx = blockLines(bodyRows, "transactions", BLOCKS.transactions)
    .map((l) => ({ description: l.rawLabel, unite: l.nums[0], taux: l.nums[1], montant: l.nums[2] }))
    .filter((r) => r.description || r.montant != null);

  const somRaw = [
    ...blockLines(bodyRows, "sommaireMid", BLOCKS.sommaireMid).map((l) => ({ ...l, block: "sommaireMid" })),
    ...blockLines(bodyRows, "sommaireRight", BLOCKS.sommaireRight).map((l) => ({ ...l, block: "sommaireRight" })),
  ];
  const sommaire = somRaw.map((l) => {
    const c = canonicalize(l.rawLabel, l.block);
    return { description: c.label, key: c.key, periode: l.nums[0], cumulatif: l.nums[1] };
  }).filter((r) => r.periode != null || r.cumulatif != null);

  // Cumulative snapshot (stateKey → cumulatif $) for the ledger row.
  const ytd = {};
  for (const s of sommaire) if (s.key && s.cumulatif != null) ytd[s.key] = s.cumulatif;

  const hoursCorrection = correctLegacyHours(tx, sommaire, ytd);

  // Accent/case-insensitive text for label-anchored header captures.
  const nText = norm(allText);
  const grab = (re) => (nText.match(re) || [])[1] || "";
  const header = {
    employeeNumber: headerValue(rows, /^employe/),
    name: headerValue(rows, /^nom$/),
    date: grab(/date\s+(\d{4}-\d{2}-\d{2})/),
    ref: grab(/(d\d{4}-\d{4})/)?.toUpperCase() || "",
    periodStart: grab(/(\d{4}-\d{2}-\d{2})\s+au/),
    periodEnd: grab(/\bau\s+(\d{4}-\d{2}-\d{2})/),
    week: grab(/semaine\s+(\d{1,2})/),
    ccqNumber: grab(/ccq\s*#?\s*(\d+)/),
    gains: grab(/gains\s+\$([\d.,]+)/),
    retenues: grab(/retenues\s+\$([\d.,]+)/),
    paieNette: grab(/paie nette\s+\$([\d.,]+)/),
    imposableFederal: grab(/imposables?\s*-\s*federal\s+\$([\d.,]+)/),
    imposableProvincial: grab(/imposables?\s*-\s*provincial\s+\$([\d.,]+)/),
    rbq: grab(/rbq\s*#?\s*([\d-]+)/),
  };

  return { header, transactions: tx, sommaire, ytd, periodEnd: header.periodEnd, hoursCorrection };
}
