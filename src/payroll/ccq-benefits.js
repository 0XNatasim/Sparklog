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

  // Safety-equipment allowance — a NON-taxable amount paid on top (like KM). Per hour.
  // Source: stub D0033-0007 transaction line "Équipement de sécurité" @ 0,8000 $/h.
  safetyEquipmentPerHour: 0.80,

  // Employer "avantages sociaux" contribution shown on the stub as an imputed gain then
  // deducted back (a display wash — NOT cash, NOT in any tax base). Per worked hour.
  // ⚠️ SEEDED from stub D0033-0007 (355,00 $ / 40 h = 8,875 $/h); source the exact CCQ
  // employer avantages-sociaux rate before finalized use.
  employerSocialBenefitPerHour: 8.875,

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

// ── Union dues (cotisation syndicale) by union ─────────────────────────────────
// A FEDERAL income-tax deduction (T4127 U1); a Québec credit (not a base deduction).
// Each union's weekly formula, from ccq.org "Cotisations redistribuées aux
// associations syndicales" (+ the member's stub where confirmed):
//   • rateOfHourlyWage — % of ONE hour's wage per week (compagnon)
//   • apprenticeRateOfHourlyWage — the apprentice % where it differs
//   • perHour — added per hour worked
//   • flatByLevel — a fixed weekly amount that REPLACES the formula for that level
// ⚠️ Draft: compagnon rates are the best-sourced; some apprentice figures are
// partial. Confirm per member's local/annexe before finalized use.
// CCQ prélèvement (regulatory levy) rate: 0,75 % of the CCQ-reportable wage (base
// wage, EXCLUDING the team-leader premium) + the vacation indemnity. The 0,75 % rate
// is documented (ccq.org); the base was derived from stub D0033-0007
// (0,0075 × (2 031,60 + 264,11) = 17,22 $, to the cent). Draft — confirm the base
// (premium in/out) against the CCQ prélèvement rule before finalized use.
export const CCQ_PRELEVEMENT_RATE = 0.0075;

export const CCQ_UNIONS = {
  ftq_fipoe: {
    label: "FTQ-FIPOE",
    // 55 % + 0,05 $/h — confirmed against Simon B.'s stub (0,55 × 50,79 + 0,05 × 40 = 29,93 $).
    dues: { rateOfHourlyWage: 0.55, perHour: 0.05 },
    // Caisse d'éducation syndicale — 0,02 $/h (derived from D0033-0007: 0,02 × 40 = 0,80 $). Draft.
    caisseEducationPerHour: 0.02,
  },
  international_568: {
    label: "International (FIPOE 568)",
    // Compagnon 65 % + 0,05 $/h; apprenti 50 % du taux compagnon + 0,05 $/h.
    dues: { rateOfHourlyWage: 0.65, apprenticeRateOfHourlyWage: 0.50, perHour: 0.05 },
  },
  csd: {
    label: "CSD Construction",
    // 50 % de la 1re heure déclarée + 0,035 $/h (tous les membres).
    dues: { rateOfHourlyWage: 0.50, perHour: 0.035 },
  },
  csn: {
    label: "CSN-Construction",
    // Compagnon 50 % de la 1re heure/semaine; apprentis montant fixe/semaine.
    dues: { rateOfHourlyWage: 0.50, perHour: 0, flatByLevel: { apprentice1: 9.90, apprentice2: 10.45, apprentice3: 11.70, apprentice4: 11.70 } },
  },
  sqc: {
    label: "SQC",
    // Montant fixe par semaine, par niveau.
    dues: { flatByLevel: { journeyman: 15.25, apprentice1: 9.95, apprentice2: 10.75, apprentice3: 11.95, apprentice4: 11.95 } },
  },
};

// Base for the 13 % indemnité de congés (and the prélèvement): the wage EARNED at the
// regular + overtime rates — regular hours at the base rate plus overtime hours weighted
// by their multiplier (1,5× / 2×) — EXCLUDING the team-leader premium. This matches the
// employer's talon: e.g. 31 h + 2 h temps double = (31 + 2×2) × 50,79 = 1 777,65 $, so
// the 13 % lands on the overtime premium too (not on straight hours × base rate).
export function vacationableWage({ hours = 0, hourlyWage = 0, overtime150Hours = 0, overtime200Hours = 0 } = {}) {
  const wage = Number(hourlyWage) || 0;
  const ot15 = Math.max(0, Number(overtime150Hours) || 0);
  const ot20 = Math.max(0, Number(overtime200Hours) || 0);
  const regular = Math.max(0, (Number(hours) || 0) - ot15 - ot20);
  return wage * (regular + ot15 * 1.5 + ot20 * 2);
}

// Auto-computed CCQ levies withheld from pay (also federal U1 deductions): the
// prélèvement CCQ and the caisse d'éducation syndicale. Returns period dollars.
// Rates are draft (see CCQ_PRELEVEMENT_RATE + each union's caisseEducationPerHour).
export function computeCcqLevies({
  hours = 0,
  hourlyWage = 0,
  overtime150Hours = 0,
  overtime200Hours = 0,
  vacationHolidaySickRate = CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate,
  union = "ftq_fipoe",
  prelevementRate = CCQ_PRELEVEMENT_RATE,
} = {}) {
  const round2 = (x) => Math.round(x * 100) / 100;
  const h = Math.max(0, Number(hours) || 0);
  const wage = Number(hourlyWage) || 0;
  // Prélèvement base = the vacationable wage (base + OT rates) + the 13 % indemnity.
  const vacBase = vacationableWage({ hours: h, hourlyWage: wage, overtime150Hours, overtime200Hours });
  const vacation = round2(vacBase * vacationHolidaySickRate);
  const prelevementCcq = round2(prelevementRate * (vacBase + vacation));
  const caissePerHour = CCQ_UNIONS[union]?.caisseEducationPerHour || 0;
  const caisseEducationSyndicale = round2(caissePerHour * h);
  return { prelevementCcq, caisseEducationSyndicale };
}

export const CCQ_UNION_KEYS = Object.keys(CCQ_UNIONS);

// Weekly union dues for a member. `level` is a CCQ_LEVELS key (for flat/apprentice
// lookups). Returns dollars.
export function computeUnionDues({ union = "ftq_fipoe", level = "journeyman", hourlyWage = 0, hours = 0 } = {}) {
  const u = CCQ_UNIONS[union];
  if (!u) return 0;
  const d = u.dues;
  const flat = d.flatByLevel?.[level];
  if (flat != null) return flat; // fixed weekly amount replaces the formula
  const wage = Number(hourlyWage) || 0;
  const h = Math.max(0, Number(hours) || 0);
  const rate = level !== "journeyman" && d.apprenticeRateOfHourlyWage != null
    ? d.apprenticeRateOfHourlyWage
    : (d.rateOfHourlyWage || 0);
  return rate * wage + (d.perHour || 0) * h;
}

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
  overtime150Hours = 0, // temps et demi (for the 13 % indemnity base)
  overtime200Hours = 0, // temps double
  employeePensionRate = CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employeePensionRate,
  taxableBenefitPerHour = CCQ_ELECTRICIAN_IC_C3.taxableBenefitPerHour,
  vacationHolidaySickRate = CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate,
  medicEmployeePerHour = CCQ_ELECTRICIAN_IC_C3.medicEmployeePerHour,
  medicProvincialTaxRate = CCQ_ELECTRICIAN_IC_C3.medicProvincialTaxRate,
  safetyEquipmentPerHour = CCQ_ELECTRICIAN_IC_C3.safetyEquipmentPerHour,
  employerSocialBenefitPerHour = CCQ_ELECTRICIAN_IC_C3.employerSocialBenefitPerHour,
  union = "ftq_fipoe",
  level = "journeyman",
  // Union/professional withholdings that are ALSO federal U1 deductions but whose CCQ
  // rate/base isn't yet sourced — passed as period amounts (Québec credit, not a base
  // deduction). See docs/rules/2026-das-payroll.md.
  prelevementCcq = 0,
  caisseEducationSyndicale = 0,
} = {}) {
  const round2 = (x) => Math.round(x * 100) / 100; // to the cent
  const h = Math.max(0, Number(hours) || 0);
  const wage = Number(hourlyWage) || 0;
  const baseWage = h * wage; // straight-time base wage, no premium (pension/other bases)

  // Indemnité de congés (13 %): on the wage earned at base + overtime rates (regular
  // hours + OT weighted by 1,5× / 2×), premium excluded — matches the talon. With no
  // overtime this equals baseWage × 13 %.
  const vacation = round2(vacationableWage({ hours: h, hourlyWage: wage, overtime150Hours, overtime200Hours }) * vacationHolidaySickRate);
  // Avantage imposable MÉDIC (assurance vie + maladie) — the CCQ taxable benefit.
  const taxableBenefit = round2(h * taxableBenefitPerHour);
  // Employee pension contribution — on wage + indemnity; reduces taxable income.
  // The employer (and CCQ) rounds the pensionable hourly base to the cent BEFORE
  // applying the rate: 50,79 × 1,13 = 57,3927 → 57,39 → × 9 % × 40 h = 206,60 $.
  // Carrying full precision here lands 1¢ high and shifts the printed taxable bases
  // (and thus federal tax) by 1-2¢. Matching the per-component rounding reproduces the
  // stub's printed "gains imposables" (2 386,59 $) and federal tax (259,95 $) exactly.
  const pensionableHourlyBase = round2(wage * (1 + vacationHolidaySickRate));
  const pensionDeduction = round2(pensionableHourlyBase * employeePensionRate * h);
  // MÉDIC premium + provincial insurance tax — net withholding, NOT a tax deduction.
  const medicWithholding = h * medicEmployeePerHour * (1 + medicProvincialTaxRate);
  // Union dues (per the member's union) — withheld from pay AND a federal income-tax
  // deduction (U1); a Québec credit (not a base deduction).
  const unionDues = computeUnionDues({ union, level, hourlyWage: wage, hours: h });
  // Safety-equipment allowance — a NON-taxable amount paid on top of net (like KM).
  const safetyEquipment = h * safetyEquipmentPerHour;
  // Employer avantages-sociaux contribution — imputed gain shown then reversed (a
  // display wash: not cash, not taxed). Used only for the gross-up presentation.
  const employerSocialBenefit = h * employerSocialBenefitPerHour;
  const prelevement = Number(prelevementCcq) || 0;
  const caisse = Number(caisseEducationSyndicale) || 0;

  // Québec taxable income: salaire + indemnity + avantage imposable − deductible pension.
  const taxableQuebec = vacation + taxableBenefit - pensionDeduction;

  return {
    vacation,
    taxableBenefit,
    pensionDeduction,
    medicWithholding,
    unionDues,
    safetyEquipment,
    employerSocialBenefit,
    prelevementCcq: prelevement,
    caisseEducationSyndicale: caisse,
    // The pension, MÉDIC premium, union dues, prélèvement and caisse are all withheld
    // from pay, so the caller subtracts this from the engine's (statutory-only) net.
    netWithholdings: pensionDeduction + medicWithholding + unionDues + prelevement + caisse,
    // Federal income-tax deductions (T4127 U1): union dues + prélèvement CCQ + caisse
    // d'éducation. Québec treats them as credits (not base deductions). The caller
    // passes this to the federal tax profile (annualized).
    federalDeduction: unionDues + prelevement + caisse,
    baseAdjustments: {
      // 13 % indemnity is insurable (EI/RQAP) and pensionable (RRQ).
      insurableEI: vacation,
      // RQAP insurable does NOT pick up the MÉDIC taxable benefit: an "avantage
      // imposable EN NATURE" (the employer's group-insurance contribution) is not
      // subject to RQAP. Confirmed against Revenu Québec (rémunérations non
      // assujetties au RQAP) — verified vs WebRAS (which returns 11,15 $ only when the
      // benefit is wrongly entered as insurable; the sourced value is 10,57 $).
      insurableRQAP: vacation,
      // RRQ pensionable DOES pick up the MÉDIC taxable benefit (it is pensionable).
      pensionable: vacation + taxableBenefit,
      taxableQuebec,
      // Federal source-deduction base EXCLUDES the MÉDIC taxable benefit (Québec taxes
      // it; the CRA does not withhold on it at source → T4A). So the federal base is
      // the Québec base minus that same avantage imposable = salaire + indemnité −
      // retraite. Union dues are applied separately as a federal income deduction (U1).
      taxableFederal: taxableQuebec - taxableBenefit,
    },
  };
}
