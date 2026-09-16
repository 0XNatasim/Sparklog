import React, { useEffect, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A print-friendly CCQ-style pay stub built from the bench result + the CCQ benefit
// breakdown + stored YTD cumulatives. It is a DRAFT: the DAS figures come from the
// unvalidated placeholder rule set. Never a substitute for the official pay stub.
export default function PayStubPrint({ open, onOpenChange, result, ytd, pay, reimb, ccq: ccqPeriod, employee, frequency, week, onOutput }) {
  const [hdr, setHdr] = useState({
    employer: "",
    periodStart: week?.start ? week.start.format("YYYY-MM-DD") : "",
    periodEnd: week?.end ? week.end.format("YYYY-MM-DD") : "",
    payDate: "", week: week?.weekNo ? String(week.weekNo) : "", ref: "",
  });
  const setH = (k) => (e) => setHdr((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!open || !week) return;
    setHdr((s) => ({
      ...s,
      periodStart: week.start ? week.start.format("YYYY-MM-DD") : s.periodStart,
      periodEnd: week.end ? week.end.format("YYYY-MM-DD") : s.periodEnd,
      week: week.weekNo ? String(week.weekNo) : s.week,
    }));
  }, [open, week]);

  if (!result || !result.gross) return null;
  const g = result.gross, emp = result.employee;
  const base = n(pay.baseRate);
  const prem = n(pay.premium);
  const regHrs = n(pay.regularHours);
  const hours = regHrs + n(pay.ot150Hours) + n(pay.ot200Hours);

  // ── CCQ period components (from computeCcqBenefits) ──
  const cash = n(g.total);                               // salaire + prime (cash earnings)
  const vac = n(ccqPeriod?.vacation);                    // indemnité de congés (13 %)
  const imposable = n(ccqPeriod?.taxableBenefit);        // avantage imposable add. CCQ
  const empSocial = n(ccqPeriod?.employerSocialBenefit); // avantages sociaux (avantage)
  const safety = n(ccqPeriod?.safetyEquipment);          // équipement de sécurité (payé)
  const pension = n(ccqPeriod?.pensionDeduction);        // avantages sociaux (déduction)
  const medicTotal = n(ccqPeriod?.medicWithholding);     // MÉDIC + taxe
  const medicPremium = medicTotal / 1.09;                // Assurance MÉDIC
  const medicTax = medicTotal - medicPremium;            // Taxe de vente assurance
  const union = n(ccqPeriod?.unionDues);                 // cotisation syndicale
  const prel = n(ccqPeriod?.prelevementCcq);             // prélèvement CCQ
  const caisse = n(ccqPeriod?.caisseEducationSyndicale); // caisse d'éducation syndicale
  const kmReimb = n(reimb?.km);
  const phoneReimb = n(reimb?.phone);

  // ── Gross-up presentation (matches the CCQ stub) ──
  const statutory = n(emp.federalTax) + n(emp.quebecTax) + n(emp.rrq.total) + n(emp.ei) + n(emp.rqap);
  const reversals = vac + imposable + empSocial;         // non-cash benefits, reversed
  const grossUp = cash + reversals + safety;             // "Gains"
  const withheld = statutory + pension + medicTotal + union + prel + caisse;
  const totalRetenues = reversals + withheld;            // "Retenues"
  const net = grossUp - totalRetenues;                   // "Paie nette" (incl. safety)
  const netPlusReimb = net + kmReimb + phoneReimb;       // amount actually deposited

  const gainsRRQ = cash + vac + imposable;               // pensionable this period
  const gainsAE = cash + vac;                            // insurable EI/RQAP this period

  // ── Transactions (pay + non-taxable allowances) ──
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

  // ── Sommaire (période + cumulatif), mirroring the real stub's line set ──
  // group: "gain" | "ded" | "base" — drives the section split on the stub.
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
  const groupLabel = { gain: "Gains", ded: "Retenues", base: "Bases cumulatives" };

  const rulesTag = `${result.meta?.rulesVersion?.quebec || "—"} / ${result.meta?.rulesVersion?.federal || "—"}`;

  // ── Standalone HTML (for the PDF download / new-window print) ──────────────
  // Rebuilds the stub with self-contained CSS (no Tailwind in the new window).
  function buildStubHtml() {
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
    const gainRows = gains.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.unit === "" ? "" : n(r.unit).toFixed(2)}</td>
      <td class="num">${r.taux === "" ? "" : n(r.taux).toFixed(4)}</td>
      <td class="num add">${money(r.montant)}</td></tr>`).join("");
    const somTone = (g) => g === "gain" ? "add" : g === "ded" ? "ded" : "";
    let lastGroup = null;
    const somRows = sommaire.map((r) => {
      const head = r.group !== lastGroup ? (lastGroup = r.group, `<tr class="grp"><td colspan="3">${groupLabel[r.group]}</td></tr>`) : "";
      const per = r.hours ? n(r.per).toFixed(2) : money(r.per);
      const cum = r.hours ? n(r.cum).toFixed(2) : money(r.cum);
      const tc = r.hours ? "" : somTone(r.group);
      return `${head}<tr><td>${esc(r.label)}</td><td class="num ${tc}">${per}</td><td class="num ${tc}">${cum}</td></tr>`;
    }).join("");

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Talon de paie${hdr.week ? " — sem. " + esc(hdr.week) : ""}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; padding: 16px; font-size: 11px; line-height: 1.35; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
  .sheet { max-width: 760px; margin: 0 auto; border: 1px solid #111; position: relative; }
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
  .add { color: #15803d; }  /* gain / addition — green */
  .ded { color: #dc2626; }  /* déduction — red */
  .paid { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 16px; background: #0f172a; color: #fff; padding: 8px 12px; border-bottom: 1px solid #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .paid-detail { font-size: 11px; }
  .paid-total { font-weight: 600; }
  .paid-total b { font-family: ui-monospace, monospace; font-size: 16px; margin-left: 8px; }
  @media print { .add { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .ded { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  @page { size: letter; margin: 12mm; }
</style></head>
<body>
  <div class="sheet">
    <div class="wm"><span>BROUILLON · DRAFT</span></div>
    <div class="band">
      <div><h1>TALON DE PAIE</h1><div class="sub">Pay stub — reproduction (moteur SparkLog)</div></div>
      <div class="emp">${esc(hdr.employer || "Employeur")}<div class="sub">${esc(employee?.full_name || "")}</div></div>
    </div>
    <div class="info">${infoRows}</div>
    <div class="totals">
      <div><div class="lbl">Gains</div><div class="val add">${money(grossUp)}</div></div>
      <div><div class="lbl">Retenues</div><div class="val ded">${money(totalRetenues)}</div></div>
      <div><div class="lbl">Paie nette</div><div class="val">${money(net)}</div></div>
    </div>
    <div class="paid">
      <span class="paid-detail">Paie nette ${money(net)}${kmReimb > 0 ? ` + Indemnité KM ${money(kmReimb)}` : ""}${phoneReimb > 0 ? ` + Données cellulaire ${money(phoneReimb)}` : ""}</span>
      <span class="paid-total">Paie nette + remboursements <b>${money(netPlusReimb)}</b></span>
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
      Jeu de règles ${esc(rulesTag)} (non validé). Présentation « gross-up » : les avantages
      non-cash (vacances, avantage imposable, avantages sociaux employeur) figurent dans les
      Gains puis sont repris dans les Retenues; paie nette = Gains − Retenues. L'équipement de
      sécurité et les indemnités (KM, données) sont des montants non imposables payés, inclus
      dans la paie nette. Ce document ne remplace pas le talon de paie officiel.
    </div>
  </div>
</body></html>`;
  }

  // Advance the cumulatives (if the parent opted in) after the stub is output.
  function afterOutput() { try { onOutput?.(); } catch { /* non-fatal */ } }

  function printStub() { window.print(); afterOutput(); }

  function downloadPdf() {
    const w = window.open("", "_blank", "width=820,height=1060");
    if (!w) { window.print(); afterOutput(); return; } // popup blocked → fall back to in-place print
    w.document.open();
    w.document.write(buildStubHtml());
    w.document.close();
    // Let layout settle, then open the print dialog (user chooses "Enregistrer en PDF").
    w.onload = () => { w.focus(); w.print(); };
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* onload handles it */ } }, 400);
    afterOutput();
  }

  // Green = gain/addition, red = deduction, neutral = informational base (or hours).
  const toneClass = (group) => group === "gain" ? "text-green-700" : group === "ded" ? "text-red-600" : "";
  const Row = ({ r }) => {
    const tc = r.hours ? "" : toneClass(r.group);
    return (
      <tr className="border-b last:border-0">
        <td className="py-0.5">{r.label}</td>
        <td className={`text-right font-mono ${tc}`}>{r.hours ? n(r.per).toFixed(2) : money(r.per)}</td>
        <td className={`text-right font-mono ${tc}`}>{r.hours ? n(r.cum).toFixed(2) : money(r.cum)}</td>
      </tr>
    );
  };

  let lastGroup = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .payslip-print, .payslip-print * { visibility: visible !important; }
            .payslip-print { position: absolute; left: 0; top: 0; width: 100%; padding: 12px; }
            .payslip-noprint { display: none !important; }
          }
        `}</style>

        {/* Controls (not printed) */}
        <div className="payslip-noprint mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="text-xs"><span className="text-muted-foreground">Employeur</span><input value={hdr.employer} onChange={setH("employer")} placeholder="Nom de l'employeur" className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">Période du</span><input type="date" value={hdr.periodStart} onChange={setH("periodStart")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">au</span><input type="date" value={hdr.periodEnd} onChange={setH("periodEnd")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">Date de paie</span><input type="date" value={hdr.payDate} onChange={setH("payDate")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">Semaine</span><input value={hdr.week} onChange={setH("week")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">No. réf.</span><input value={hdr.ref} onChange={setH("ref")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
        </div>
        <div className="payslip-noprint mb-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={printStub}><Printer className="mr-1.5 h-4 w-4" />Imprimer</Button>
          <Button size="sm" onClick={downloadPdf}><Download className="mr-1.5 h-4 w-4" />Télécharger PDF</Button>
        </div>

        {/* The stub — calqué sur un talon de paie construction (QC) */}
        <div className="payslip-print relative overflow-hidden rounded border border-neutral-900 bg-white text-[11px] leading-tight text-black">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-24deg] text-5xl font-black tracking-widest text-red-500/10">BROUILLON · DRAFT</span>
          </div>

          {/* Title band */}
          <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
            <div>
              <div className="text-sm font-bold tracking-wide">TALON DE PAIE</div>
              <div className="text-[10px] opacity-80">Pay stub — reproduction (moteur SparkLog)</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold">{hdr.employer || "Employeur"}</div>
              <div className="text-[10px] opacity-80">{employee?.full_name || ""}</div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-5 border-b border-neutral-900 px-3 py-2">
            {[
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
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-dotted border-slate-300 py-0.5">
                <span className="text-slate-500">{k}</span><b className="text-right">{v}</b>
              </div>
            ))}
          </div>

          {/* Totals band — Gains green, Retenues red, Paie nette neutral */}
          <div className="grid grid-cols-3">
            {[["Gains", grossUp, "text-green-700"], ["Retenues", totalRetenues, "text-red-600"], ["Paie nette", net, ""]].map(([lbl, val, tc], i) => (
              <div key={i} className={`border-b border-neutral-900 px-3 py-2 ${i < 2 ? "border-r border-neutral-900" : "bg-slate-100"}`}>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{lbl}</div>
                <div className={`font-mono text-base font-extrabold ${tc}`}>{money(val)}</div>
              </div>
            ))}
          </div>

          {/* Amount actually paid = paie nette + non-taxable reimbursements (KM, phone) */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutral-900 bg-slate-900 px-3 py-2 text-white">
            <span className="text-[11px]">
              Paie nette {money(net)}
              {kmReimb > 0 && <> + Indemnité KM <span className="text-green-300">{money(kmReimb)}</span></>}
              {phoneReimb > 0 && <> + Données cellulaire <span className="text-green-300">{money(phoneReimb)}</span></>}
            </span>
            <span className="font-semibold">Paie nette + remboursements <span className="ml-2 font-mono text-lg font-extrabold">{money(netPlusReimb)}</span></span>
          </div>

          {/* Body: Transactions + Sommaire */}
          <div className="grid grid-cols-2">
            <div className="border-r border-neutral-900 px-3 py-2">
              <div className="mb-1 bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Transactions</div>
              <table className="w-full">
                <thead><tr className="border-b border-neutral-900 text-left text-[9px] uppercase text-slate-500"><th className="py-0.5">Description</th><th className="text-right">Unité</th><th className="text-right">Taux</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {gains.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-0.5">{r.label}</td>
                      <td className="text-right font-mono">{r.unit === "" ? "" : n(r.unit).toFixed(2)}</td>
                      <td className="text-right font-mono">{r.taux === "" ? "" : n(r.taux).toFixed(4)}</td>
                      <td className="text-right font-mono text-green-700">{money(r.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-3 py-2">
              <div className="mb-1 bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Sommaire — Période / Cumulatif</div>
              <table className="w-full">
                <thead><tr className="border-b border-neutral-900 text-left text-[9px] uppercase text-slate-500"><th className="py-0.5">Description</th><th className="text-right">Période</th><th className="text-right">Cumulatif</th></tr></thead>
                <tbody>
                  {sommaire.map((r, i) => {
                    const head = r.group !== lastGroup ? (lastGroup = r.group, true) : false;
                    return (
                      <React.Fragment key={`s${i}`}>
                        {head && (
                          <tr className="border-b border-slate-300 bg-slate-50"><td colSpan={3} className="py-1 text-[9px] font-bold uppercase text-slate-600">{groupLabel[r.group]}</td></tr>
                        )}
                        <Row r={r} />
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="border-t border-neutral-900 px-3 py-2 text-[9px] text-slate-600">
            <b>BROUILLON — paie non finalisée · Nécessite une révision de la paie.</b> Jeu de règles {rulesTag} (non validé).
            Présentation « gross-up » : les avantages non-cash (vacances, avantage imposable, avantages sociaux
            employeur) figurent dans les Gains puis sont repris dans les Retenues; paie nette = Gains − Retenues.
            L'équipement de sécurité et les indemnités (KM, données) sont des montants non imposables payés, inclus
            dans la paie nette. Ce document ne remplace pas le talon de paie officiel.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
