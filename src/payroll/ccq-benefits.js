// ─────────────────────────────────────────────────────────────────────────────
// CCQ collective-agreement benefit accounting.
//
// This sits UPSTREAM of the pure tax engine (spec step 17: TIME → CCQ → GROSS →
// PAYROLL). It contains NO tax logic. Given a period's worked hours + hourly wage
// it produces the CCQ benefit amounts, the per-base adjustments the engine folds
// in through `calculatePayroll({ baseAdjustments })`, and the CCQ-specific net
// withholdings (pension + MÉDIC) the caller subtracts from take-home pay.
//
// ⚠️  DRAFT / TEST-BENCH VALUES — not finalized pay. Every result stays
// `requires_review` until validated against WebRAS/PDOC with specialist sign-off.
// ─────────────────────────────────────────────────────────────────────────────
//
// Source: CCQ, secteur institutionnel-commercial, métier électricien (code 220),
// annexe C3 (aussi C4-C5), en vigueur du 26 avril 2026 au 24 avril 2027.
//
// Two DISTINCT "avantages sociaux" components — do not conflate them (this was the
// bug behind the earlier reverse-engineered 5,797 $/h):
//
//   1. Cotisation salariale au régime de retraite — employee pension contribution.
//      = wage × (1 + 13% indemnity) × pension rate (9% compagnon / 4,5% apprenti).
//      It is DEDUCTIBLE from the employee's taxable income AND withheld from pay.
//      It follows the wage automatically (no hardcoded per-hour amount), so it
//      tracks the annual wage increase. Compagnon C3 2026: 50,79 × 1,13 × 9% =
//      5,165343 $/h.
//
//   2. MÉDIC Construction — employee insurance premium + Québec 9% insurance tax.
//      = 0,68 $/h × 1,09 = 0,7412 $/h. It is WITHHELD from pay but is NOT a tax
//      deduction (it does not reduce taxable income). The CCQ exceptionally held
//      the premium at 0,68 $/h through 2027-04-24 (vs the 0,86 $ in the agreement).
//
//   3. Avantage imposable additionnel — 3,377 $/h, same for every level of the
//      trade (the CCQ does not vary it by apprenticeship period). It INCREASES the
//      RRQ pensionable + Québec taxable bases. Source: CCQ ICI 2026-2027 table
//      (tests/Tableau-Institutionnel-Commercial-2026-2027.pdf, ligne Électricien).
//
//   4. Indemnité de congés (vacances 6% + fériés 5,5% + maladie 1,5% = 13% of the
//      base wage). It is pensionable (RRQ) + insurable (EI/RQAP) + Québec taxable.

export const CCQ_ELECTRICIAN_IC_C3 = {
  trade: "Électricien (métier 220)",
  sector: "Institutionnel-commercial",
  annex: "C3",
  effectiveFrom: "2026-04-26",
  effectiveTo: "2027-04-24",

  // Avantage imposable MÉDIC Construction (assurance vie + maladie) — per worked hour.
  // Source: CCQ "Avantages sociaux MÉDIC Construction — Avantages imposables", secteur
  // institutionnel-commercial, en vigueur du 2026-04-26 au 2027-04-24, ligne Électricien
  // (code 220): colonne C3/C4-C5 = 3,377 $, colonne C6/C7-C8 = 3,408 $.
  // It is a QUÉBEC taxable benefit AND pensionable (RRQ), but the CRA does NOT require
  // the employer to withhold on it at source (reported on a T4A at year-end), so it is
  // EXCLUDED from the federal source-deduction base: fédéral = provincial − ce montant.
  taxableBenefitPerHour: 3.377,
  // Indemnité de congés annuels + fériés + maladie (6 + 5,5 + 1,5 %).
  vacationHolidaySickRate: 0.13,
  // MÉDIC Construction employee premium + Québec insurance tax (net withholding).
  medicEmployeePerHour: 0.68,
  medicProvincialTaxRate: 0.09,

  // Salaires C3 en vigueur le 26 avril 2026 + taux de cotisation retraite salariale.
  levels: {
    journeyman:  { label: "Compagnon",  hourlyWage: 50.79, employeePensionRate: 0.09 },
    apprentice1: { label: "Apprenti 1", hourlyWage: 25.40, employeePensionRate: 0.045 },
    apprentice2: { label: "Apprenti 2", hourlyWage: 30.47, employeePensionRate: 0.045 },
    apprentice3: { label: "Apprenti 3", hourlyWage: 35.55, employeePensionRate: 0.045 },
    apprentice4: { label: "Apprenti 4", hourlyWage: 43.17, employeePensionRate: 0.045 },
  },
};

// Ordered level keys, for building a picker.
export const CCQ_LEVELS = Object.keys(CCQ_ELECTRICIAN_IC_C3.levels);

// Compute the CCQ benefit amounts, engine base adjustments and net withholdings
// for one period. Dollar amounts (the engine converts to cents).
//   hours              — total worked hours (regular + overtime hours)
//   hourlyWage         — base hourly wage for the level (WITHOUT team-leader premium)
//   employeePensionRate— 0.09 (compagnon) or 0.045 (apprenti)
// The remaining rates default to the sourced électricien-C3 values but stay
// overridable so the bench can model another métier/level.
export function computeCcqBenefits({
  hours = 0,
  hourlyWage = 0,
  employeePensionRate = CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employeePensionRate,
  taxableBenefitPerHour = CCQ_ELECTRICIAN_IC_C3.taxableBenefitPerHour,
  vacationHolidaySickRate = CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate,
  medicEmployeePerHour = CCQ_ELECTRICIAN_IC_C3.medicEmployeePerHour,
  medicProvincialTaxRate = CCQ_ELECTRICIAN_IC_C3.medicProvincialTaxRate,
} = {}) {
  const h = Math.max(0, Number(hours) || 0);
  const wage = Number(hourlyWage) || 0;
  const baseWage = h * wage; // straight-time base wage, no premium

  // Indemnité de congés (13 % of the base wage).
  const vacation = baseWage * vacationHolidaySickRate;
  // Avantage imposable MÉDIC (assurance vie + maladie) — the CCQ taxable benefit.
  const taxableBenefit = h * taxableBenefitPerHour;
  // Employee pension contribution — on wage + indemnity; reduces taxable income.
  const pensionDeduction = baseWage * (1 + vacationHolidaySickRate) * employeePensionRate;
  // MÉDIC premium + provincial insurance tax — net withholding, NOT a tax deduction.
  const medicWithholding = h * medicEmployeePerHour * (1 + medicProvincialTaxRate);

  // Québec taxable income: salaire + indemnity + avantage imposable − deductible pension.
  const taxableQuebec = vacation + taxableBenefit - pensionDeduction;

  return {
    vacation,
    taxableBenefit,
    pensionDeduction,
    medicWithholding,
    // Both the pension contribution and the MÉDIC premium are withheld from pay,
    // so the caller subtracts this from the engine's (statutory-only) net pay.
    netWithholdings: pensionDeduction + medicWithholding,
    baseAdjustments: {
      // 13 % indemnity is insurable (EI/RQAP) and pensionable (RRQ).
      insurableEI: vacation,
      insurableRQAP: vacation,
      // RRQ pensionable also picks up the MÉDIC taxable benefit.
      pensionable: vacation + taxableBenefit,
      taxableQuebec,
      // Federal source-deduction base EXCLUDES the MÉDIC taxable benefit (Québec taxes
      // it; the CRA does not withhold on it at source → T4A). So the federal base is
      // the Québec base minus that same avantage imposable = salaire + indemnité −
      // retraite. Any further federal/Québec gap (union dues U1, prélèvement) is NOT
      // modelled here — see docs/rules/2026-das-payroll.md.
      taxableFederal: taxableQuebec - taxableBenefit,
    },
  };
}
