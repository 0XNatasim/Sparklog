import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A print-friendly CCQ-style pay stub built from the bench result + stored YTD
// cumulatives. It is a DRAFT: the DAS figures come from the unvalidated placeholder
// rule set, and the CCQ Période cells that the app doesn't compute are left blank.
// Never a substitute for the official pay stub.
export default function PayStubPrint({ open, onOpenChange, result, ytd, pay, reimb, employee, frequency, week }) {
  const [hdr, setHdr] = useState({
    periodStart: week?.start ? week.start.format("YYYY-MM-DD") : "",
    periodEnd: week?.end ? week.end.format("YYYY-MM-DD") : "",
    payDate: "", week: week?.weekNo ? String(week.weekNo) : "", ref: "",
  });
  const setH = (k) => (e) => setHdr((s) => ({ ...s, [k]: e.target.value }));

  // When opened, sync the period/week header from the currently selected week.
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

  // Transactions (gains detail): unit / rate / amount. Regular is split into the
  // base-rate line + the premium line ("Régulier à taux horaire"); OT is on base.
  const gains = [
    { label: "Salaire régulier fixe", unit: pay.regularHours, taux: base, montant: regHrs * base },
    { label: "Temps et demi", unit: pay.ot150Hours, taux: base * 1.5, montant: n(pay.ot150Hours) * base * 1.5 },
    { label: "Temps double", unit: pay.ot200Hours, taux: base * 2, montant: n(pay.ot200Hours) * base * 2 },
    prem ? { label: "Régulier à taux horaire", unit: pay.regularHours, taux: prem, montant: regHrs * prem } : null,
    n(pay.taxableBenefit) ? { label: "Avantage imposable", unit: "", taux: "", montant: n(pay.taxableBenefit) } : null,
  ].filter(Boolean);

  // Non-taxable reimbursements — paid on top of net, outside the DAS calc.
  const reimbursements = [
    n(reimb?.km) ? { label: "Indemnité KM", montant: n(reimb.km) } : null,
    n(reimb?.phone) ? { label: "Remboursement données cellulaire", montant: n(reimb.phone) } : null,
  ].filter(Boolean);
  const reimbTotal = reimbursements.reduce((s, r) => s + r.montant, 0);

  // Sommaire: statutory lines carry a Période (from the calc) + Cumulatif (YTD + période).
  const stat = [
    { label: "Gains", per: g.total, cum: n(ytd.grossIncome) + g.total },
    { label: "Impôt Québec", per: emp.quebecTax, cum: n(ytd.quebecTax) + emp.quebecTax },
    { label: "Impôt Fédéral", per: emp.federalTax, cum: n(ytd.federalTax) + emp.federalTax },
    { label: "Contr. au RRQ", per: emp.rrq.total, cum: n(ytd.rrqEmployee) + emp.rrq.total },
    { label: "Contr. à AE", per: emp.ei, cum: n(ytd.eiEmployee) + emp.ei },
    { label: "Contr. au RQAP", per: emp.rqap, cum: n(ytd.rqapEmployee) + emp.rqap },
    { label: "Gains RRQ", per: g.total, cum: n(ytd.pensionableIncomeRRQ) + g.total },
    { label: "Gains AE", per: g.total, cum: n(ytd.insurableIncomeEI) + g.total },
    { label: "Gains RQAP", per: g.total, cum: n(ytd.insurableIncomeRQAP) + g.total },
    { label: "Heures", per: hours, cum: n(ytd.hoursYtd) + hours, hours: true },
  ];
  // CCQ record-only lines: no Période computed, Cumulatif = stored YTD.
  const ccq = [
    { label: "Vacances CCQ", cum: ytd.vacancesCcq },
    { label: "Cotisation syndicale", cum: ytd.unionDues },
    { label: "Prélèvement CCQ", cum: ytd.ccqLevy },
    { label: "Av. sociaux CCQ (déd.)", cum: ytd.ccqBenefitsDeduction },
    { label: "Av. sociaux CCQ (avantage)", cum: ytd.ccqBenefitsAdvantage },
    { label: "Avantage imposable add. CCQ", cum: ytd.ccqTaxableBenefit },
    { label: "Assurance MÉDIC", cum: ytd.medicInsurance },
    { label: "Caisse d'éducation syndicale", cum: ytd.unionEducationFund },
    { label: "Taxe de vente assurance", cum: ytd.insuranceSalesTax },
    { label: "Équipement de sécurité", cum: ytd.safetyEquipment },
    { label: "Indemnité KM", cum: ytd.kmIndemnity },
    { label: "Autre revenu", cum: ytd.otherIncome },
  ];

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
        <div className="payslip-noprint mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="text-xs"><span className="text-muted-foreground">Période du</span><input type="date" value={hdr.periodStart} onChange={setH("periodStart")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">au</span><input type="date" value={hdr.periodEnd} onChange={setH("periodEnd")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">Date de paie</span><input type="date" value={hdr.payDate} onChange={setH("payDate")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">Semaine</span><input value={hdr.week} onChange={setH("week")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <label className="text-xs"><span className="text-muted-foreground">No. réf.</span><input value={hdr.ref} onChange={setH("ref")} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
        </div>
        <div className="payslip-noprint mb-3 flex justify-end">
          <Button size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Imprimer</Button>
        </div>

        {/* The stub */}
        <div className="payslip-print relative rounded border bg-white p-4 text-[11px] leading-tight text-black">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-24deg] text-5xl font-black tracking-widest text-red-500/15">BROUILLON · DRAFT</span>
          </div>

          {/* Header */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 border-b pb-2">
            <div><b>Employé</b> {employee?.employee_number || "—"}</div>
            <div className="col-span-2"><b>Nom</b> {employee?.full_name || "—"}</div>
            <div><b>Occupation</b> Électricien</div>
            <div><b>Province</b> Québec</div>
            <div><b>Date</b> {hdr.payDate || "—"}</div>
            <div><b>Période de paie</b> {hdr.periodStart || "—"} au {hdr.periodEnd || "—"}</div>
            <div><b>Semaine</b> {hdr.week || "—"}</div>
            <div><b>No. réf.</b> {hdr.ref || "—"}</div>
            <div><b>CCQ #</b> {employee?.ccq_number || "—"}</div>
            <div className="col-span-2"><b>Fréquence</b> {frequency}</div>
          </div>

          {/* Totals band */}
          <div className="grid grid-cols-3 gap-4 border-b py-2 font-semibold">
            <div>Gains <span className="float-right font-mono">{money(g.total)}</span></div>
            <div>Retenues <span className="float-right font-mono">{money(emp.totalDeductions)}</span></div>
            <div>Paie nette <span className="float-right font-mono">{money(emp.netPay)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            {/* Transactions */}
            <div>
              <div className="mb-1 font-semibold italic">Transactions</div>
              <table className="w-full">
                <thead><tr className="border-b text-left"><th className="py-0.5">Description</th><th className="text-right">Unité</th><th className="text-right">Taux</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {gains.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-0.5">{r.label}</td>
                      <td className="text-right font-mono">{r.unit === "" ? "" : n(r.unit).toFixed(2)}</td>
                      <td className="text-right font-mono">{r.taux === "" ? "" : n(r.taux).toFixed(4)}</td>
                      <td className="text-right font-mono">{money(r.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {reimbursements.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 font-semibold italic">Remboursements <span className="font-normal">(non imposables)</span></div>
                  <table className="w-full">
                    <tbody>
                      {reimbursements.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-0.5">{r.label}</td>
                          <td className="text-right font-mono">{money(r.montant)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="py-0.5">Paie nette + remboursements</td>
                        <td className="text-right font-mono">{money(emp.netPay + reimbTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sommaire */}
            <div>
              <div className="mb-1 font-semibold italic">Sommaire</div>
              <table className="w-full">
                <thead><tr className="border-b text-left"><th className="py-0.5">Description</th><th className="text-right">Période</th><th className="text-right">Cumulatif</th></tr></thead>
                <tbody>
                  {stat.map((r, i) => (
                    <tr key={`s${i}`} className="border-b last:border-0">
                      <td className="py-0.5">{r.label}</td>
                      <td className="text-right font-mono">{r.hours ? n(r.per).toFixed(2) : money(r.per)}</td>
                      <td className="text-right font-mono">{r.hours ? n(r.cum).toFixed(2) : money(r.cum)}</td>
                    </tr>
                  ))}
                  {ccq.map((r, i) => (
                    <tr key={`c${i}`} className="border-b last:border-0 text-muted-foreground">
                      <td className="py-0.5">{r.label}</td>
                      <td className="text-right">—</td>
                      <td className="text-right font-mono">{money(r.cum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 border-t pt-2 text-[9px]">
            BROUILLON — paie non finalisée · Nécessite une révision de la paie. Jeu de règles {result.meta?.rulesVersion?.quebec} / {result.meta?.rulesVersion?.federal} (non validé).
            Les cellules « Période » des lignes CCQ ne sont pas calculées par l'application. Ce document ne remplace pas le talon de paie officiel.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
