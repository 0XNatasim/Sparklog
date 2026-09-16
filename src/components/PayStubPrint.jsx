import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A print-friendly CCQ-style pay stub built from the bench result + the CCQ benefit
// breakdown + stored YTD cumulatives. It is a DRAFT: the DAS figures come from the
// unvalidated placeholder rule set. Never a substitute for the official pay stub.
export default function PayStubPrint({ open, onOpenChange, result, ytd, pay, reimb, ccq: ccqPeriod, employee, frequency, week }) {
  const [hdr, setHdr] = useState({
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

  const gainsRRQ = cash + vac + imposable;               // pensionable this period
  const gainsAE = cash + vac;                            // insurable EI/RQAP this period

  // ── Transactions (pay + non-taxable allowances) ──
  const gains = [
    { label: "Salaire régulier fixe", unit: regHrs, taux: base, montant: regHrs * base },
    { label: "Temps et demi", unit: n(pay.ot150Hours), taux: base * 1.5, montant: n(pay.ot150Hours) * base * 1.5 },
    { label: "Temps double", unit: n(pay.ot200Hours), taux: base * 2, montant: n(pay.ot200Hours) * base * 2 },
    prem ? { label: "Régulier à taux horaire", unit: regHrs, taux: prem, montant: regHrs * prem } : null,
    safety ? { label: "Équipement de sécurité", unit: hours, taux: safety / (hours || 1), montant: safety } : null,
    kmReimb ? { label: "Indemnité KM (utilisation véhicule)", unit: pay.km, taux: pay.kmRate, montant: kmReimb } : null,
    phoneReimb ? { label: "Remboursement données cellulaire", unit: "", taux: "", montant: phoneReimb } : null,
    n(pay.taxableBenefit) ? { label: "Autre avantage imposable", unit: "", taux: "", montant: n(pay.taxableBenefit) } : null,
  ].filter(Boolean);

  // ── Sommaire (période + cumulatif), mirroring the real stub's line set ──
  const line = (label, per, cum, opts = {}) => ({ label, per, cum, ...opts });
  const sommaire = [
    line("Salaire régulier", cash, n(ytd.regularEarnings) + cash),
    line("Vacances CCQ", vac, n(ytd.vacancesCcq) + vac),
    line("Avantage imposable add. CCQ", imposable, n(ytd.ccqTaxableBenefit) + imposable),
    line("Avantages sociaux CCQ (avantage)", empSocial, n(ytd.ccqBenefitsAdvantage) + empSocial),
    line("Équipement de sécurité", safety, n(ytd.safetyEquipment) + safety),
    line("Impôt Québec", n(emp.quebecTax), n(ytd.quebecTax) + n(emp.quebecTax)),
    line("Impôt Fédéral", n(emp.federalTax), n(ytd.federalTax) + n(emp.federalTax)),
    line("Contr. au RRQ", n(emp.rrq.total), n(ytd.rrqEmployee) + n(emp.rrq.total)),
    line("Contr. à AE", n(emp.ei), n(ytd.eiEmployee) + n(emp.ei)),
    line("Contr. au RQAP", n(emp.rqap), n(ytd.rqapEmployee) + n(emp.rqap)),
    line("Av. sociaux CCQ (déd.) — retraite", pension, n(ytd.ccqBenefitsDeduction) + pension),
    line("Assurance MÉDIC", medicPremium, n(ytd.medicInsurance) + medicPremium),
    line("Taxe de vente assurance", medicTax, n(ytd.insuranceSalesTax) + medicTax),
    line("Cotisation syndicale", union, n(ytd.unionDues) + union),
    line("Prélèvement CCQ", prel, n(ytd.ccqLevy) + prel),
    line("Caisse d'éducation syndicale", caisse, n(ytd.unionEducationFund) + caisse),
    line("Gains RRQ", gainsRRQ, n(ytd.pensionableIncomeRRQ) + gainsRRQ),
    line("Gains AE", gainsAE, n(ytd.insurableIncomeEI) + gainsAE),
    line("Gains RQAP", gainsAE, n(ytd.insurableIncomeRQAP) + gainsAE),
    line("Heures", hours, n(ytd.hoursYtd) + hours, { hours: true }),
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
            <div>Gains <span className="float-right font-mono">{money(grossUp)}</span></div>
            <div>Retenues <span className="float-right font-mono">{money(totalRetenues)}</span></div>
            <div>Paie nette <span className="float-right font-mono">{money(net)}</span></div>
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
              <p className="mt-2 text-[10px] text-neutral-500">
                Équipement de sécurité et indemnités (KM, données) sont des montants non
                imposables payés; ils sont inclus dans la paie nette.
              </p>
            </div>

            {/* Sommaire */}
            <div>
              <div className="mb-1 font-semibold italic">Sommaire</div>
              <table className="w-full">
                <thead><tr className="border-b text-left"><th className="py-0.5">Description</th><th className="text-right">Période</th><th className="text-right">Cumulatif</th></tr></thead>
                <tbody>
                  {sommaire.map((r, i) => (
                    <tr key={`s${i}`} className="border-b last:border-0">
                      <td className="py-0.5">{r.label}</td>
                      <td className="text-right font-mono">{r.hours ? n(r.per).toFixed(2) : money(r.per)}</td>
                      <td className="text-right font-mono">{r.hours ? n(r.cum).toFixed(2) : money(r.cum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 border-t pt-2 text-[9px]">
            BROUILLON — paie non finalisée · Nécessite une révision de la paie. Jeu de règles {result.meta?.rulesVersion?.quebec} / {result.meta?.rulesVersion?.federal} (non validé).
            Présentation « gross-up » : les avantages non-cash (vacances, avantage imposable,
            avantages sociaux employeur) figurent dans les Gains puis sont repris dans les
            Retenues; la paie nette = Gains − Retenues. Ce document ne remplace pas le talon
            de paie officiel.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
