// A week validated through « Comptabiliser » in Calcul, rebuilt in the employer's stub layout
// ({ header, transactions[], sommaire[] }, the same shape as an imported talon) so the Talons tab can
// show exactly what Calcul computed instead of recalculating from the approved jobs. Pure.
import { printedPayLines } from "../payroll/earnings";
import { payTotals } from "./payroll-closing";

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fmt = (v) => round2(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// [ledger key, printed label, isHours]. Same labels as an imported talon's Sommaire.
const SOMMAIRE = [
  ["regularEarnings", "Salaire régulier"],
  ["doubleTime", "Temps double"],
  ["vacationPay", "Vacances"],
  ["unionDues", "Cotisation syndicale"],
  ["ccqLevy", "Prélèvement CCQ"],
  ["vacancesCcq", "Vacances CCQ"],
  ["ccqBenefitsDeduction", "Avantages sociaux CCQ (Déduction)"],
  ["ccqBenefitsAdvantage", "Avantages sociaux CCQ (Avantage)"],
  ["safetyEquipment", "Équipement de sécurité"],
  ["hoursYtd", "Heures"],
  ["quebecTax", "Impôt Québec"],
  ["federalTax", "Impôt Fédéral"],
  ["eiEmployee", "Contr. à AE"],
  ["rrqEmployee", "Contr. au RRQ"],
  ["insurableIncomeEI", "Gains AE"],
  ["pensionableIncomeRRQ", "Gains RRQ"],
  ["hoursAe", "Heures AE"],
  ["otherIncome", "Autre Revenu 1"],
  ["unionEducationFund", "Caisse d'éducation syndicale"],
  ["insurableIncomeRQAP", "Gains RQAP"],
  ["rqapEmployee", "Contr. au RQAP"],
  ["ccqTaxableBenefit", "Avantage imposable additionnel CCQ"],
  ["insuranceSalesTax", "Taxe de vente assurance"],
  ["medicInsurance", "Assurance MÉDIC"],
  ["kmIndemnity", "Indemnité KM (utilisation véhicule personnel)"],
];

export function buildCalculTalon({ opening = {}, closing, result, ccq = null, reimb = {}, pay = {}, employee = {}, week = {}, reference = "", payDate = "" }) {
  const n = (v) => Number(v) || 0;
  const base = n(pay.baseRate);
  const lines = printedPayLines({
    regularHours: n(pay.regularHours), ot150Hours: n(pay.ot150Hours), ot200Hours: n(pay.ot200Hours),
    returnNbHours: n(pay.returnNbHours), baseOnlyHours: n(pay.baseOnlyHours), baseRate: base, premium: n(pay.premium),
  });
  const phone = n(reimb.phone);
  const phoneUnits = phone > 0 && Math.abs(phone / 7 - Math.round(phone / 7)) < 1e-9 ? Math.round(phone / 7) : 1;
  const tx = (description, unite, taux, montant) => ({ description, unite, taux, montant: round2(montant) });
  const transactions = [
    tx("Salaire régulier fixe", n(pay.regularHours), base, lines.regularBase),
    tx("Temps et demi", n(pay.ot150Hours) || null, round2(base * 1.5), lines.ot150),
    tx("Temps double", n(pay.ot200Hours) || null, round2(base * 2), lines.ot200),
    n(pay.returnNbHours) ? tx("Temps de retour (sans avantages)", n(pay.returnNbHours), base, lines.returnNoBenefit) : null,
    ccq && n(ccq.safetyEquipment) ? tx("Équipement de sécurité", null, 0.8, ccq.safetyEquipment) : null,
    n(reimb.km) ? tx("Indemnité utilisation véhicule", n(pay.km), n(pay.kmRate), reimb.km) : null,
    n(reimb.other) ? tx("Autre revenu non imposable (à verser)", 1, n(reimb.other), reimb.other) : null,
    n(pay.premium) ? tx("Régulier à taux horaire", n(pay.regularHours), n(pay.premium), lines.regularPremium) : null,
    phone ? tx("Remboursement données cellulaire", phoneUnits, phoneUnits === 1 ? phone : 7, phone) : null,
    n(pay.baseOnlyHours) ? tx("Régulier à taux horaire", n(pay.baseOnlyHours), base, lines.baseOnly) : null,
  ].filter(Boolean);

  const delta = (key) => round2(n(closing[key]) - n(opening[key]));
  const sommaire = [];
  for (const [key, description] of SOMMAIRE) {
    const stateKey = key === "hoursAe" ? "hoursYtd" : key;
    const periode = delta(stateKey);
    // The employer prints the optional lines (vacation line, other income, caisse…) only when they move.
    if (!periode && ["vacationPay", "otherIncome", "unionEducationFund", "doubleTime", "kmIndemnity"].includes(key)) continue;
    sommaire.push({ key: key === "hoursAe" ? null : key, description, periode, cumulatif: round2(closing[stateKey]) });
  }

  const totals = result?.employee ? payTotals(result, ccq, reimb) : null;
  const header = {
    source: "calcul",
    employeeNumber: employee.employee_number || "",
    name: employee.full_name || "",
    ccqNumber: employee.ccq_number || "",
    ref: reference,
    date: payDate,
    periodStart: week.periodStart || "",
    periodEnd: week.periodEnd || "",
    week: week.weekNo ? String(week.weekNo) : "",
    gains: totals ? fmt(totals.gains) : "",
    retenues: totals ? fmt(totals.totalRetenues) : "",
    paieNette: totals ? fmt(totals.netPlusReimb) : "",
  };
  return { header, transactions, sommaire };
}
