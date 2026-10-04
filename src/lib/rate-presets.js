// Test-mode rate presets for validating past stubs week by week (Paie › Calcul, "Partir du
// cumulatif"). The collective agreement changed on 2026-04-26; the values below are read off real
// stubs (D0008-0009, D0009-0009 before; D0012-0049 … D0018-0008 after). They are not defaults for
// live payroll.
import dayjs from "dayjs";

export const AGREEMENT_CHANGE_DATE = "2026-04-26";

// Before: "Salaire régulier fixe" 45,36 $/h + "Régulier à taux horaire" 3,00 $/h (= the 48,36 $/h
// scale, so the 3 $ counts for the union dues but not for the 13 % indemnity).
export const BEFORE_PRESET = Object.freeze({
  kind: "before",
  baseRate: 45.36,
  premium: 3,
  vacationPct: 13,
  imposablePerHour: 3.111,
  medicPerHour: 0.68,
  medicTaxPct: 9,
  safety: 0.65,
  social: 8.32,
  pensionPerHour: 4.338, // a stated amount; after the change the 9 % formula applies again
});

// After: the sourced current rates (calculator defaults); no premium appears on the May–June stubs.
export function afterPreset({ baseRate = 50.79 } = {}) {
  return Object.freeze({ kind: "after", baseRate, premium: 0, vacationPct: 13, medicTaxPct: 9 });
}

// Which preset fits a pay week that starts on `weekStart` (YYYY-MM-DD or dayjs).
export function presetKindForWeekStart(weekStart) {
  return dayjs(weekStart).isBefore(dayjs(AGREEMENT_CHANGE_DATE), "day") ? "before" : "after";
}
