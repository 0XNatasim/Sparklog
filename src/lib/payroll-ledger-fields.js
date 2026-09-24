// Shared field mapping for the payroll ledger (payroll_period_ledger).
//
// A ledger row is a week's CLOSING cumulative (YTD) snapshot — which is exactly the
// "Cumulatif" column of a CCQ pay stub. Importing an old stub therefore means parsing that
// column and writing a ledger row for the stub's week. This module centralises the
// stateKey ↔ DB-column mapping so the Calcul bench and the legacy-stub import agree.

// CCQ / record-only cumulative fields: [stateKey, dbColumn, frenchLabel].
export const CCQ_CUMUL = [
  ["vacancesCcq", "vacances_ccq", "Vacances CCQ (13%)"],
  ["regularEarnings", "regular_earnings", "Salaire régulier"],
  ["doubleTime", "double_time", "Temps double"],
  ["vacationPay", "vacation_pay", "Vacances"],
  ["ccqLevy", "ccq_levy", "Prélèvement CCQ"],
  ["ccqBenefitsDeduction", "ccq_benefits_deduction", "Av. sociaux CCQ (déd.)"],
  ["ccqBenefitsAdvantage", "ccq_benefits_advantage", "Av. sociaux CCQ (avantage)"],
  ["ccqTaxableBenefit", "ccq_taxable_benefit", "Avantage imposable add. CCQ"],
  ["medicInsurance", "medic_insurance", "Assurance MÉDIC"],
  ["unionDues", "union_dues", "Cotisation syndicale"],
  ["unionEducationFund", "union_education_fund", "Caisse d'éducation syndicale"],
  ["insuranceSalesTax", "insurance_sales_tax", "Taxe de vente assurance"],
  ["safetyEquipment", "safety_equipment", "Équipement de sécurité"],
  ["kmIndemnity", "km_indemnity", "Indemnité KM"],
  ["otherIncome", "other_income", "Autre revenu"],
  ["hoursYtd", "hours_ytd", "Heures"],
];

// Statutory cumulative fields: [stateKey, dbColumn, frenchLabel].
export const YTD_STATUTORY = [
  ["grossIncome", "gross_income", "Revenu brut"],
  ["rrqEmployee", "rrq_employee", "RRQ"],
  ["rrq2Employee", "rrq2_employee", "RRQ2"],
  ["eiEmployee", "ei_employee", "Assurance-emploi"],
  ["rqapEmployee", "rqap_employee", "RQAP"],
  ["federalTax", "federal_tax", "Impôt fédéral"],
  ["quebecTax", "quebec_tax", "Impôt Québec"],
  ["pensionableIncomeRRQ", "pensionable_income_rrq", "Gains ouvrant droit à pension (RRQ)"],
  ["insurableIncomeEI", "insurable_income_ei", "Gains assurables (AE)"],
  ["insurableIncomeRQAP", "insurable_income_rqap", "Gains assurables (RQAP)"],
  ["labourStandardsIncome", "labour_standards_income", "Revenu (normes du travail)"],
];

// Every cumulative field as [stateKey, dbColumn(, label)].
export const YTD_ALL = [...YTD_STATUTORY, ...CCQ_CUMUL];

// A field list for editable forms: { key, column, label }.
export const LEDGER_FIELDS = YTD_ALL.map(([key, column, label]) => ({ key, column, label }));

export const EMPTY_YTD = Object.fromEntries(YTD_ALL.map(([k]) => [k, 0]));

// Map a ledger DB row → a snapshot object (stateKeys, dollars).
export function ledgerRowToSnapshot(row) {
  const snap = { ...EMPTY_YTD };
  for (const [k, col] of YTD_ALL) snap[k] = Number(row?.[col]) || 0;
  return snap;
}

// Map a snapshot (stateKeys) → a ledger DB row's column values.
export function snapshotToLedgerColumns(snap) {
  const num = (v) => Number(v) || 0;
  return Object.fromEntries(YTD_ALL.map(([k, col]) => [col, num(snap?.[k])]));
}
