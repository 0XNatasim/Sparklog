// Shared pay-stub (talon) rendering — the single source of truth for the CCQ-style stub,
// used by PayStubPrint (on-screen + single PDF) and the batch "tous les talons" export.
//
// ⚠️ DRAFT: the DAS figures come from the unvalidated placeholder rule set. Never a
// substitute for the official pay stub.

const n = (v) => Number(v) || 0;
export const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Fixed employer on every talon.
export const EMPLOYER = "Messier Connexion inc.";
// Pay date = the Thursday FOLLOWING the pay week (which ends on a Saturday): +5 days.
export const payDateFor = (weekEnd) => (weekEnd ? weekEnd.add(5, "day").format("YYYY-MM-DD") : "");

// The default header for a talon (employer + period + pay date + week no + reference).
export function defaultHeader({ week, reference } = {}) {
  return {
    employer: EMPLOYER,
    periodStart: week?.start ? week.start.format("YYYY-MM-DD") : "",
    periodEnd: week?.end ? week.end.format("YYYY-MM-DD") : "",
    payDate: payDateFor(week?.end),
    week: week?.weekNo ? String(week.weekNo) : "",
    ref: reference || "",
  };
}

export const groupLabel = { gain: "Gains", ded: "Retenues", base: "Bases cumulatives" };

// Compute every derived value the stub shows, from the engine result + CCQ breakdown +
// opening YTD. Returns null when there is no gross to show. This is the ONE place the stub
// math lives — both the React view and the printable HTML read from it.
export function buildStubModel({ result, ytd = {}, pay = {}, reimb = {}, ccq: ccqPeriod = {} }) {
  if (!result || !result.gross) return null;
  const g = result.gross, emp = result.employee;
  const base = n(pay.baseRate);
  const prem = n(pay.premium);
  const regHrs = n(pay.regularHours);
  const hours = regHrs + n(pay.ot150Hours) + n(pay.ot200Hours);

  // ── CCQ period components (from computeCcqBenefits) ──
  const cash = n(g.total);
  const vac = n(ccqPeriod?.vacation);
  const imposable = n(ccqPeriod?.taxableBenefit);
  const empSocial = n(ccqPeriod?.employerSocialBenefit);
  const safety = n(ccqPeriod?.safetyEquipment);
  const pension = n(ccqPeriod?.pensionDeduction);
  const medicTotal = n(ccqPeriod?.medicWithholding);
  const medicPremium = medicTotal / 1.09;
  const medicTax = medicTotal - medicPremium;
  const union = n(ccqPeriod?.unionDues);
  const prel = n(ccqPeriod?.prelevementCcq);
  const caisse = n(ccqPeriod?.caisseEducationSyndicale);
  const kmReimb = n(reimb?.km);
  const phoneReimb = n(reimb?.phone);

  // ── Gross-up presentation (matches the CCQ stub) ──
  const statutory = n(emp.federalTax) + n(emp.quebecTax) + n(emp.rrq.total) + n(emp.ei) + n(emp.rqap);
  const reversals = vac + imposable + empSocial;
  const grossUp = cash + reversals + safety;
  const withheld = statutory + pension + medicTotal + union + prel + caisse;
  const totalRetenues = reversals + withheld;
  const net = grossUp - totalRetenues;
  const netPlusReimb = net + kmReimb + phoneReimb;

  const gainsRRQ = cash + vac + imposable;
  const gainsAE = cash + vac;

  const gains = [
    { label: "Salaire régulier fixe", unit: regHrs, taux: base, montant: regHrs * base },
    { label: "Temps et demi", unit: n(pay.ot150Hours), taux: base * 1.5, montant: n(pay.ot150Hours) * base * 1.5 },
    { label: "Temps double", unit: n(pay.ot200Hours), taux: base * 2, montant: n(pay.ot200Hours) * base * 2 },
    prem ? { label: "Prime chef d'équipe", unit: regHrs, taux: prem, montant: regHrs * prem } : null,
    safety ? { label: "Équipement de sécurité", unit: hours, taux: safety / (hours || 1), montant: safety } : null,
    kmReimb ? { label: "Indemnité KM (utilisation véhicule)", unit: pay.km, taux: pay.kmRate, montant: kmReimb } : null,
    phoneReimb ? { label: "Remboursement données cellulaire", unit: "", taux: "", montant: phoneReimb } : null,
    n(pay.taxableBenefit) ? { label: "Autre avantage imposable", unit: "", taux: "", montant: n(pay.taxableBenefit) } : null,
  ].filter((r) => r && (r.montant || r.label));

  const line = (label, per, cum, group, opts = {}) => ({ label, per, cum, group, ...opts });
  const sommaire = [
    line("Salaire régulier", cash, n(ytd.regularEarnings) + cash, "gain"),
    line("Vacances CCQ", vac, n(ytd.vacancesCcq) + vac, "gain"),
    line("Avantage imposable add. CCQ", imposable, n(ytd.ccqTaxableBenefit) + imposable, "gain"),
    line("Avantages sociaux CCQ (avantage)", empSocial, n(ytd.ccqBenefitsAdvantage) + empSocial, "gain"),
    line("Équipement de sécurité", safety, n(ytd.safetyEquipment) + safety, "gain"),
    line("Impôt Québec", n(emp.quebecTax), n(ytd.quebecTax) + n(emp.quebecTax), "ded"),
    line("Impôt Fédéral", n(emp.federalTax), n(ytd.federalTax) + n(emp.federalTax), "ded"),
    line("Contr. au RRQ", n(emp.rrq.total), n(ytd.rrqEmployee) + n(emp.rrq.total), "ded"),
    line("Contr. à AE", n(emp.ei), n(ytd.eiEmployee) + n(emp.ei), "ded"),
    line("Contr. au RQAP", n(emp.rqap), n(ytd.rqapEmployee) + n(emp.rqap), "ded"),
    line("Av. sociaux CCQ (déd.) — retraite", pension, n(ytd.ccqBenefitsDeduction) + pension, "ded"),
    line("Assurance MÉDIC", medicPremium, n(ytd.medicInsurance) + medicPremium, "ded"),
    line("Taxe de vente assurance", medicTax, n(ytd.insuranceSalesTax) + medicTax, "ded"),
    line("Cotisation syndicale", union, n(ytd.unionDues) + union, "ded"),
    line("Prélèvement CCQ", prel, n(ytd.ccqLevy) + prel, "ded"),
    line("Caisse d'éducation syndicale", caisse, n(ytd.unionEducationFund) + caisse, "ded"),
    line("Gains RRQ", gainsRRQ, n(ytd.pensionableIncomeRRQ) + gainsRRQ, "base"),
    line("Gains AE", gainsAE, n(ytd.insurableIncomeEI) + gainsAE, "base"),
    line("Gains RQAP", gainsAE, n(ytd.insurableIncomeRQAP) + gainsAE, "base"),
    line("Heures travaillées", hours, n(ytd.hoursYtd) + hours, "base", { hours: true }),
  ];

  const rulesTag = `${result.meta?.rulesVersion?.quebec || "—"} / ${result.meta?.rulesVersion?.federal || "—"}`;

  return {
    gains, sommaire, groupLabel, rulesTag,
    grossUp, totalRetenues, net, netPlusReimb, kmReimb, phoneReimb,
  };
}

// The self-contained CSS for the printable stub (no Tailwind in the print window).
export const STUB_STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; padding: 16px; font-size: 11px; line-height: 1.35; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
  .sheet { max-width: 760px; margin: 0 auto 18px; border: 1px solid #111; position: relative; }
  .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .wm span { transform: rotate(-24deg); font-size: 64px; font-weight: 900; letter-spacing: 6px; color: rgba(220,38,38,.10); }
  .band { background: #1f2937; color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
  .band h1 { font-size: 14px; margin: 0; letter-spacing: 1px; }
  .band .sub { font-size: 10px; opacity: .85; }
  .band .emp { font-size: 12px; font-weight: 700; text-align: right; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; padding: 8px 12px; border-bottom: 1px solid #111; }
  .i { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #cbd5e1; padding: 2px 0; }
  .i span { color: #64748b; }
  .totals { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  .totals > div { padding: 8px 12px; border-right: 1px solid #111; border-bottom: 1px solid #111; }
  .totals > div:last-child { border-right: 0; background: #f1f5f9; }
  .totals .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #475569; }
  .totals .val { font-size: 15px; font-weight: 800; font-family: ui-monospace, monospace; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; }
  .cols > div { padding: 8px 12px; }
  .cols > div:first-child { border-right: 1px solid #111; }
  .sec { font-weight: 700; text-transform: uppercase; letter-spacing: .5px; font-size: 10px; background: #e2e8f0; padding: 3px 6px; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; border-bottom: 1px solid #111; padding: 3px 4px; font-size: 9px; text-transform: uppercase; color: #475569; }
  th.num { text-align: right; }
  td { padding: 2px 4px; border-bottom: 1px solid #eef2f7; }
  tr.grp td { background: #f8fafc; font-weight: 700; font-size: 9px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #cbd5e1; padding-top: 5px; }
  .foot { padding: 8px 12px; border-top: 1px solid #111; font-size: 9px; color: #334155; }
  .add { color: #15803d; }
  .ded { color: #dc2626; }
  .paid { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 16px; background: #0f172a; color: #fff; padding: 8px 12px; border-bottom: 1px solid #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .paid-detail { font-size: 11px; }
  .paid-total { font-weight: 600; }
  .paid-total b { font-family: ui-monospace, monospace; font-size: 16px; margin-left: 8px; }
  .sheet + .sheet { page-break-before: always; }
  @media print { .add { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .ded { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  @page { size: letter; margin: 12mm; }
`;

// The inner `.sheet` markup for one talon.
export function stubSheetHtml({ model, hdr, employee, frequency }) {
  const info = [
    ["Employé", employee?.employee_number || "—"],
    ["Nom", employee?.full_name || "—"],
    ["Occupation", "Électricien"],
    ["CCQ #", employee?.ccq_number || "—"],
    ["Province", "Québec"],
    ["Fréquence", frequency || "—"],
    ["Période de paie", `${hdr.periodStart || "—"} au ${hdr.periodEnd || "—"}`],
    ["Date de paie", hdr.payDate || "—"],
    ["Semaine", hdr.week || "—"],
    ["No. réf.", hdr.ref || "—"],
  ];
  const infoRows = info.map(([k, v]) => `<div class="i"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const gainRows = model.gains.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.unit === "" ? "" : n(r.unit).toFixed(2)}</td>
      <td class="num">${r.taux === "" ? "" : n(r.taux).toFixed(4)}</td>
      <td class="num add">${money(r.montant)}</td></tr>`).join("");
  const somTone = (grp) => grp === "gain" ? "add" : grp === "ded" ? "ded" : "";
  let lastGroup = null;
  const somRows = model.sommaire.map((r) => {
    const head = r.group !== lastGroup ? (lastGroup = r.group, `<tr class="grp"><td colspan="3">${groupLabel[r.group]}</td></tr>`) : "";
    const per = r.hours ? n(r.per).toFixed(2) : money(r.per);
    const cum = r.hours ? n(r.cum).toFixed(2) : money(r.cum);
    const tc = r.hours ? "" : somTone(r.group);
    return `${head}<tr><td>${esc(r.label)}</td><td class="num ${tc}">${per}</td><td class="num ${tc}">${cum}</td></tr>`;
  }).join("");

  return `<div class="sheet">
    <div class="wm"><span>BROUILLON · DRAFT</span></div>
    <div class="band">
      <div><h1>TALON DE PAIE</h1><div class="sub">Pay stub — reproduction (moteur SparkLog)</div></div>
      <div class="emp">${esc(hdr.employer || "Employeur")}<div class="sub">${esc(employee?.full_name || "")}</div></div>
    </div>
    <div class="info">${infoRows}</div>
    <div class="totals">
      <div><div class="lbl">Gains</div><div class="val add">${money(model.grossUp)}</div></div>
      <div><div class="lbl">Retenues</div><div class="val ded">${money(model.totalRetenues)}</div></div>
      <div><div class="lbl">Paie nette</div><div class="val">${money(model.net)}</div></div>
    </div>
    <div class="paid">
      <span class="paid-detail">Paie nette ${money(model.net)}${model.kmReimb > 0 ? ` + Indemnité KM ${money(model.kmReimb)}` : ""}${model.phoneReimb > 0 ? ` + Données cellulaire ${money(model.phoneReimb)}` : ""}</span>
      <span class="paid-total">Paie nette + remboursements <b>${money(model.netPlusReimb)}</b></span>
    </div>
    <div class="cols">
      <div>
        <p class="sec">Transactions</p>
        <table><thead><tr><th>Description</th><th class="num">Unité</th><th class="num">Taux</th><th class="num">Montant</th></tr></thead>
        <tbody>${gainRows}</tbody></table>
      </div>
      <div>
        <p class="sec">Sommaire — Période / Cumulatif</p>
        <table><thead><tr><th>Description</th><th class="num">Période</th><th class="num">Cumulatif</th></tr></thead>
        <tbody>${somRows}</tbody></table>
      </div>
    </div>
    <div class="foot">
      <b>BROUILLON — paie non finalisée · Nécessite une révision de la paie.</b>
      Jeu de règles ${esc(model.rulesTag)} (non validé). Présentation « gross-up » : les avantages
      non-cash (vacances, avantage imposable, avantages sociaux employeur) figurent dans les
      Gains puis sont repris dans les Retenues; paie nette = Gains − Retenues. L'équipement de
      sécurité et les indemnités (KM, données) sont des montants non imposables payés, inclus
      dans la paie nette. Ce document ne remplace pas le talon de paie officiel.
    </div>
  </div>`;
}

// A full standalone HTML document wrapping one or more talon sheets.
export function stubDocument(sheets, title = "Talons de paie") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${STUB_STYLES}</style></head>
<body>${sheets.join("\n")}</body></html>`;
}

// One-stub HTML document (used by PayStubPrint's single download).
export function buildStubHtml({ model, hdr, employee, frequency }) {
  const title = `Talon de paie${hdr.week ? " — sem. " + hdr.week : ""}`;
  return stubDocument([stubSheetHtml({ model, hdr, employee, frequency })], title);
}

// Open a print window for a batch of talons: items = [{ model, hdr, employee, frequency }].
// Returns false if the popup was blocked.
export function openStubsPrint(items, title = "Talons de paie") {
  const sheets = items.map((it) => stubSheetHtml(it));
  const w = window.open("", "_blank", "width=820,height=1060");
  if (!w) return false;
  w.document.open();
  w.document.write(stubDocument(sheets, title));
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* onload handles it */ } }, 500);
  return true;
}
