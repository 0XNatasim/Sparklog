// The Dynacom cumulative row (payroll_period_ledger at DYNACOM_CUMULATIVE_END, end of week 42) shown like a
// kept talon in Talons: it is NOT a talon — only the Sommaire « Cumulatif » column, the starting point of the
// Sparklog talons from week 43. Built in the browser from the row (nothing is written), in the record shape
// legacy-talon-render.js prints ({ header, transactions, sommaire }).
import { isClosedBeforeSparklog } from "@/lib/payroll-opening";

export const DYNACOM_CUMULATIVE_SOURCE = "dynacom-cumulative";

// Stub order: earnings, deductions, employer/record lines, insurable earnings, hours.
const LINES = [
  ["grossIncome", "gross_income", "Gains bruts"],
  ["regularEarnings", "regular_earnings", "Salaire régulier"],
  ["doubleTime", "double_time", "Temps double"],
  ["vacancesCcq", "vacances_ccq", "Vacances CCQ"],
  ["vacationPay", "vacation_pay", "Vacances"],
  ["otherIncome", "other_income", "Autre Revenu 1"],
  ["kmIndemnity", "km_indemnity", "Indemnité KM (utilisation véhicule personnel)"],
  ["quebecTax", "quebec_tax", "Impôt Québec"],
  ["federalTax", "federal_tax", "Impôt Fédéral"],
  ["rrqEmployee", "rrq_employee", "Contr. au RRQ"],
  ["rrq2Employee", "rrq2_employee", "Contr. au RRQ (2e cotisation)"],
  ["eiEmployee", "ei_employee", "Contr. à AE"],
  ["rqapEmployee", "rqap_employee", "Contr. au RQAP"],
  ["ccqLevy", "ccq_levy", "Prélèvement CCQ"],
  ["unionDues", "union_dues", "Cotisation syndicale"],
  ["unionEducationFund", "union_education_fund", "Caisse d'éducation syndicale"],
  ["ccqBenefitsDeduction", "ccq_benefits_deduction", "Avantages sociaux CCQ (Déduction)"],
  ["medicInsurance", "medic_insurance", "Assurance MÉDIC"],
  ["insuranceSalesTax", "insurance_sales_tax", "Taxe de vente assurance"],
  ["ccqBenefitsAdvantage", "ccq_benefits_advantage", "Avantages sociaux CCQ (Avantage)"],
  ["ccqTaxableBenefit", "ccq_taxable_benefit", "Avantage imposable additionnel CCQ"],
  ["safetyEquipment", "safety_equipment", "Équipement de sécurité"],
  ["insurableIncomeEI", "insurable_income_ei", "Gains AE"],
  ["pensionableIncomeRRQ", "pensionable_income_rrq", "Gains RRQ"],
  ["insurableIncomeRQAP", "insurable_income_rqap", "Gains RQAP"],
  ["hoursYtd", "hours_ytd", "Heures"],
];

// A ledger row is the Dynacom cumulative when it closes a week Dynacom paid and holds no kept talon.
export function isDynacomCumulativeRow(row) {
  return Boolean(row) && !row.imported_talon && isClosedBeforeSparklog(row.period_end);
}

// `week` = { start, end, weekNo } (dayjs start/end); `profile` gives the header identity.
export function dynacomCumulativeTalon(row, { profile = {}, week = {} } = {}) {
  const fmt = (d) => (d && typeof d.format === "function" ? d.format("YYYY-MM-DD") : d ? String(d).slice(0, 10) : "");
  const sommaire = LINES
    .map(([key, col, description]) => ({ description, key, periode: null, cumulatif: Number(row?.[col]) || 0 }))
    .filter((line) => line.cumulatif !== 0);
  return {
    header: {
      source: DYNACOM_CUMULATIVE_SOURCE,
      employeeNumber: profile.employee_number || "",
      name: profile.full_name || "",
      ccqNumber: profile.ccq_number || "",
      ref: "Cumulatif Dynacom",
      periodStart: fmt(week.start),
      periodEnd: fmt(week.end) || fmt(row?.period_end),
      week: week.weekNo != null ? String(week.weekNo) : "",
    },
    transactions: [],
    sommaire,
  };
}
