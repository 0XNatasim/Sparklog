// Shared "one employee, one week" talon computation — the same math the Testing bench
// runs, packaged so the Talon and DAS sub-tabs (and, later, real pay runs) reuse it
// instead of duplicating the wiring.
//
// ⚠️ DRAFT / preview: uses the BASIC personal tax credits (no per-employee TD1) and
// default employer settings. The DAS figures come from the unvalidated rule set — never
// a substitute for the official pay stub. Freezing happens at "Comptabiliser".
import {
  calculatePayroll,
  computeCcqBenefits,
  computeCcqLevies,
  CCQ_ELECTRICIAN_IC_C3,
  PAY_PERIODS_PER_YEAR,
} from "./index.js";
import { calculatePayrollEntries, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";

const toCents = (d) => Math.round((Number(d) || 0) * 100);

// Cumulative talon reference. A single global counter (assigned at comptabilisation, in
// comptabilisation order — the first ever is 1) rendered with a fixed batch prefix:
//   seq 1 → "D0034-0001", seq 2 → "D0034-0002", …
// Change the prefix here if a new batch is opened. Empty for an unassigned (aperçu) talon.
export const TALON_REF_PREFIX = "D0034";
export function formatTalonRef(seq) {
  const nseq = Number(seq);
  return nseq > 0 ? `${TALON_REF_PREFIX}-${String(nseq).padStart(4, "0")}` : "";
}

// profiles.union_association code → CCQ_UNIONS key.
const UNION_CODE_TO_KEY = { FTQ: "ftq_fipoe", CPQMCI: "international_568", CSD: "csd", CSN: "csn", SQC: "sqc" };

// profiles.apprentice_level ("compagnon" / "apprenti_1..4") → CCQ level key.
export function levelToStatus(apprenticeLevel) {
  const m = /^apprenti_([1-4])$/.exec(String(apprenticeLevel || ""));
  return m ? `apprentice${m[1]}` : "journeyman";
}

// Employer settings affect only the employer contributions / DAS remittance side, not
// the employee net. Defaults for the preview; refine per-company later.
export const DEFAULT_EMPLOYER = { annualPayrollEstimate: 750000, fssCategory: "general", cnesstRate: 0.02, workforceSkillsFundApplicable: false };

// The YTD opening keys the engine consumes, and how they map from a payroll_ytd /
// payroll_period_ledger row (dollars).
export const YTD_COLUMN_TO_KEY = [
  ["grossIncome", "gross_income"], ["rrqEmployee", "rrq_employee"], ["rrq2Employee", "rrq2_employee"],
  ["eiEmployee", "ei_employee"], ["rqapEmployee", "rqap_employee"], ["federalTax", "federal_tax"],
  ["quebecTax", "quebec_tax"], ["pensionableIncomeRRQ", "pensionable_income_rrq"],
  ["insurableIncomeEI", "insurable_income_ei"], ["insurableIncomeRQAP", "insurable_income_rqap"],
  ["labourStandardsIncome", "labour_standards_income"],
];

export function openingFromRow(row) {
  const snap = {};
  for (const [key, col] of YTD_COLUMN_TO_KEY) snap[key] = Number(row?.[col]) || 0;
  return snap;
}

// The CCQ record-only cumulative columns (Sommaire lines on the stub). They don't feed
// the DAS calc — they only complete the YTD picture PayStubPrint shows in "Cumulatif".
export const YTD_CCQ_COLUMN_TO_KEY = [
  ["vacancesCcq", "vacances_ccq"], ["regularEarnings", "regular_earnings"], ["doubleTime", "double_time"],
  ["vacationPay", "vacation_pay"], ["ccqLevy", "ccq_levy"], ["ccqBenefitsDeduction", "ccq_benefits_deduction"],
  ["ccqBenefitsAdvantage", "ccq_benefits_advantage"], ["ccqTaxableBenefit", "ccq_taxable_benefit"],
  ["medicInsurance", "medic_insurance"], ["unionDues", "union_dues"], ["unionEducationFund", "union_education_fund"],
  ["insuranceSalesTax", "insurance_sales_tax"], ["safetyEquipment", "safety_equipment"],
  ["kmIndemnity", "km_indemnity"], ["otherIncome", "other_income"], ["hoursYtd", "hours_ytd"],
];

// A full YTD snapshot (statutory + CCQ record-only) from a payroll_ytd / payroll_period_ledger
// row (dollars). Use this for the opening balance fed to both the compute and PayStubPrint.
export function snapshotFromRow(row) {
  const snap = {};
  for (const [key, col] of [...YTD_COLUMN_TO_KEY, ...YTD_CCQ_COLUMN_TO_KEY]) snap[key] = Number(row?.[col]) || 0;
  return snap;
}

// Compute one employee's talon for a set of jobs (normally one CCQ week) on top of the
// opening YTD balance. Returns everything PayStubPrint + the DAS tab need.
export function computeEmployeeWeekTalon({ profile, jobs, opening = {}, frequency = "weekly", includePhone = false, employer = DEFAULT_EMPLOYER, weekDate, messierMethod = false }) {
  // Pay-week date used to pick the dated union-dues rule. Explicit wins; else the
  // earliest job_date in the set (any day of a CCQ week resolves the same rule window).
  const payWeekDate = weekDate || (jobs || []).reduce((min, j) => (j?.job_date && (!min || j.job_date < min) ? j.job_date : min), null) || undefined;
  const base = Number(profile?.hourly_rate) || 0;
  const prem = Number(profile?.team_leader_premium) || 0;
  const status = levelToStatus(profile?.apprentice_level);
  const union = UNION_CODE_TO_KEY[profile?.union_association] || "ftq_fipoe";

  // Hours split — honours the employee's OT policies (first-hour-double, return-no-benefit).
  const entries = calculatePayrollEntries(jobs || [], { ...overtimeOptionsFromProfile(profile), messierMethod });
  let regMin = 0, ot50 = 0, ot100 = 0, retNb = 0, totalKm = 0;
  for (const e of entries.values()) {
    regMin += e.regularWorkMinutes; ot50 += e.overtime50Minutes; ot100 += e.overtime100Minutes;
    retNb += e.returnNoBenefitMinutes; totalKm += e.totalKm;
  }
  const regularHours = regMin / 60, ot150Hours = ot50 / 60, ot200Hours = ot100 / 60, returnNbHours = retNb / 60;

  const pay = {
    regularHours, baseRate: base, premium: prem, ot150Hours, ot200Hours, returnNbHours,
    km: totalKm, kmRate: Number(profile?.km_rate) || 0, taxableBenefit: 0,
  };

  const earnings = [];
  const regular = regularHours * (base + prem);
  const overtime = ot150Hours * base * 1.5 + ot200Hours * base * 2;
  const returnNoBenefit = returnNbHours * base; // base rate, no premium, no social benefits
  if (regular) earnings.push({ type: "regular", amount: regular });
  if (overtime) earnings.push({ type: "overtime", amount: overtime });
  if (returnNoBenefit) earnings.push({ type: "regular", amount: returnNoBenefit });

  const totalHours = regularHours + ot150Hours + ot200Hours;
  const levies = computeCcqLevies({
    hours: totalHours, hourlyWage: base, overtime150Hours: ot150Hours, overtime200Hours: ot200Hours,
    vacationHolidaySickRate: CCQ_ELECTRICIAN_IC_C3.vacationHolidaySickRate,
  });
  const pensionRate = CCQ_ELECTRICIAN_IC_C3.levels[status]?.employeePensionRate ?? CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employeePensionRate;
  const ccqAmounts = computeCcqBenefits({
    hours: totalHours,
    safetyEquipmentHours: totalHours + returnNbHours, // équipement de sécurité on return time too
    hourlyWage: base,
    overtime150Hours: ot150Hours, overtime200Hours: ot200Hours,
    employeePensionRate: pensionRate,
    union, level: status,
    date: payWeekDate,
    prelevementCcq: levies.prelevementCcq,
    caisseEducationSyndicale: levies.caisseEducationSyndicale,
  });
  const unionDuesFederalAnnual = (ccqAmounts.federalDeduction || 0) * (PAY_PERIODS_PER_YEAR[frequency] || 52);

  const kmReimb = pay.km * pay.kmRate;
  const phoneReimb = includePhone ? (Number(profile?.phone_data_reimbursement) || 0) : 0;
  const safety = ccqAmounts.safetyEquipment || 0;
  const reimb = { km: kmReimb, phone: phoneReimb, safety, total: kmReimb + phoneReimb + safety };

  const result = calculatePayroll({
    taxYear: 2026,
    provinceOfEmployment: "QC",
    payPeriod: { frequency },
    employee: {
      // No per-employee TD1 → basic personal amount (engine default). Preview.
      federalTaxProfile: { td1ClaimAmount: undefined, additionalTax: 0, annualDeductions: unionDuesFederalAnnual },
      quebecTaxProfile: { personalTaxCredits: undefined, additionalTax: 0 },
    },
    employer: {
      annualPayrollEstimate: Number(employer.annualPayrollEstimate) || 0,
      fssCategory: employer.fssCategory,
      cnesstRate: employer.cnesstRate,
      workforceSkillsFundApplicable: employer.workforceSkillsFundApplicable,
    },
    earnings,
    baseAdjustments: ccqAmounts.baseAdjustments,
    ytd: {
      grossIncome: toCents(opening.grossIncome), rrqEmployee: toCents(opening.rrqEmployee), rrqEmployer: toCents(opening.rrqEmployee),
      rrq2Employee: toCents(opening.rrq2Employee), rrq2Employer: toCents(opening.rrq2Employee),
      eiEmployee: toCents(opening.eiEmployee), eiEmployer: toCents(opening.eiEmployee),
      rqapEmployee: toCents(opening.rqapEmployee), rqapEmployer: toCents(opening.rqapEmployee),
      federalTax: toCents(opening.federalTax), quebecTax: toCents(opening.quebecTax),
      pensionableIncomeRRQ: toCents(opening.pensionableIncomeRRQ), insurableIncomeEI: toCents(opening.insurableIncomeEI),
      insurableIncomeRQAP: toCents(opening.insurableIncomeRQAP), labourStandardsIncome: toCents(opening.labourStandardsIncome),
    },
  });

  return { result, ccqAmounts, reimb, pay, hours: { regularHours, ot150Hours, ot200Hours, returnNbHours, totalKm, totalHours } };
}
