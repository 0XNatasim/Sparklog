import React, { useEffect, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildStubModel, buildStubHtml, EMPLOYER, payDateFor } from "@/lib/paystub";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A print-friendly CCQ-style pay stub built from the bench result + the CCQ benefit
// breakdown + stored YTD cumulatives. It is a DRAFT: the DAS figures come from the
// unvalidated placeholder rule set. Never a substitute for the official pay stub.
// The stub math + printable HTML live in src/lib/paystub.js (shared with the batch export).
export default function PayStubPrint({ open, onOpenChange, result, ytd, pay, reimb, ccq: ccqPeriod, employee, frequency, week, reference, official = false, canApproveOfficial = false, onToggleOfficial, onOutput }) {
  const [hdr, setHdr] = useState({
    employer: EMPLOYER,
    periodStart: week?.start ? week.start.format("YYYY-MM-DD") : "",
    periodEnd: week?.end ? week.end.format("YYYY-MM-DD") : "",
    payDate: payDateFor(week?.end), week: week?.weekNo ? String(week.weekNo) : "", ref: reference || "",
  });
  const setH = (k) => (e) => setHdr((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!open || !week) return;
    setHdr((s) => ({
      ...s,
      employer: s.employer || EMPLOYER,
      periodStart: week.start ? week.start.format("YYYY-MM-DD") : s.periodStart,
      periodEnd: week.end ? week.end.format("YYYY-MM-DD") : s.periodEnd,
      payDate: week.end ? payDateFor(week.end) : s.payDate,
      week: week.weekNo ? String(week.weekNo) : s.week,
      ref: reference || s.ref,
    }));
  }, [open, week, reference]);

  const model = buildStubModel({ result, ytd, pay, reimb, ccq: ccqPeriod });
  if (!model) return null;
  const { gains, sommaire, groupLabel, rulesTag, grossUp, totalRetenues, net, netPlusReimb, kmReimb, phoneReimb } = model;

  // Advance the cumulatives (if the parent opted in) after the stub is output.
  function afterOutput() { try { onOutput?.(); } catch { /* non-fatal */ } }

  function printStub() { window.print(); afterOutput(); }

  function downloadPdf() {
    const w = window.open("", "_blank", "width=820,height=1060");
    if (!w) { window.print(); afterOutput(); return; } // popup blocked → fall back to in-place print
    w.document.open();
    w.document.write(buildStubHtml({ model, hdr, employee, frequency, official }));
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
        <div className="payslip-noprint mb-3 flex flex-wrap items-center justify-end gap-2">
          {canApproveOfficial && (
            <label className="mr-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={official} onChange={(e) => onToggleOfficial?.(e.target.checked)} />
              <span className="font-medium text-green-700 dark:text-green-400">Approved by Boss (officiel)</span>
            </label>
          )}
          <Button size="sm" variant="outline" onClick={printStub}><Printer className="mr-1.5 h-4 w-4" />Imprimer</Button>
          <Button size="sm" onClick={downloadPdf}><Download className="mr-1.5 h-4 w-4" />Télécharger PDF</Button>
        </div>

        {/* The stub — calqué sur un talon de paie construction (QC) */}
        <div className="payslip-print relative overflow-hidden rounded border border-neutral-900 bg-white text-[11px] leading-tight text-black">
          {!official && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-24deg] text-5xl font-black tracking-widest text-red-500/10">BROUILLON · DRAFT</span>
            </div>
          )}

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
            <b>{official ? "OFFICIEL — approuvé par le boss." : "BROUILLON — paie non finalisée · Nécessite une révision de la paie."}</b> Jeu de règles {rulesTag} (non validé).
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
