import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";
import { companyDate } from "@/lib/company-time";
import { availableRuleYears, setRuleSetOverrides, validateRuleData } from "@/payroll/rules/rule-overrides";
import {
  CCQ_CAISSE_EDUCATION_PER_HOUR, CCQ_ELECTRICIAN_IC_C3, CCQ_PRELEVEMENT_RATE, MEDIC_RATES, MEDIC_TAX_RATES, PAYROLL_RATE_KEYS,
  getPayrollRateOverrides, medicRatesOn, medicTaxRateOn, setPayrollRateOverrides,
} from "@/payroll/ccq-benefits";

// « Taux et barèmes » (0130): the dated payroll rates the owner edits. The coded constants are the fallback, so a
// failed read leaves the app exactly as before (the screen says so; pay is never blocked by it).
export const PAYROLL_RATES_EVENT = "sparklog:payroll-rates-changed";

// Display metadata: `kind` formats the value, `max` mirrors payroll_rate_max (0130), `coded(date)` is the value
// the code uses when no row applies.
export const PAYROLL_RATE_DEFS = Object.freeze([
  { key: "medic_employee_per_hour", kind: "money", max: 10, coded: (d) => medicRatesOn(d).employeePerHour },
  { key: "medic_employer_per_hour", kind: "money", max: 20, coded: (d) => medicRatesOn(d).employerPerHour },
  { key: "medic_tax_rate", kind: "percent", max: 0.3, coded: (d) => medicTaxRateOn(d) },
  { key: "ccq_prelevement_rate", kind: "percent", max: 0.05, coded: () => CCQ_PRELEVEMENT_RATE },
  { key: "caisse_education_per_hour", kind: "money", max: 1, coded: () => CCQ_CAISSE_EDUCATION_PER_HOUR },
  { key: "pension_rate_journeyman", kind: "percent", max: 0.3, coded: () => CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employeePensionRate },
  { key: "pension_rate_apprentice", kind: "percent", max: 0.3, coded: () => CCQ_ELECTRICIAN_IC_C3.levels.apprentice1.employeePensionRate },
  { key: "social_benefit_journeyman", kind: "money", max: 50, coded: () => CCQ_ELECTRICIAN_IC_C3.levels.journeyman.employerSocialBenefitPerHour },
  { key: "social_benefit_apprentice", kind: "money", max: 50, coded: () => CCQ_ELECTRICIAN_IC_C3.levels.apprentice1.employerSocialBenefitPerHour },
]);

// Input text ↔ stored value: percentages are typed as « 9,975 » and stored as 0.09975.
export function parseRateInput(text, def) {
  const n = Number(String(text ?? "").trim().replace(/\s/g, "").replace(",", "."));
  if (!String(text ?? "").trim() || !Number.isFinite(n) || n < 0) return null;
  const value = def.kind === "percent" ? Math.round(n * 1e4) / 1e6 : Math.round(n * 1e6) / 1e6;
  return value > def.max ? null : value;
}

export function rateInputText(value, def) {
  const n = def.kind === "percent" ? Math.round(Number(value) * 1e6) / 1e4 : Number(value);
  return String(n).replace(".", ",");
}

export async function fetchPayrollRateRows() {
  const { data, error } = await withTimeout(
    supabase.from("payroll_rates").select("rate_key, effective_from, value, note").order("effective_from").limit(500),
    10000,
  );
  if (error) throw error;
  return (data || []).map((r) => ({ key: r.rate_key, effective_from: r.effective_from, value: Number(r.value), note: r.note || "" }));
}

// Reads the rows and installs them in the payroll code. Returns the rows; throws on a read error.
export async function loadPayrollRates() {
  // The yearly scales load alongside; a failure there never blocks the simple rates (coded 2026 applies).
  await loadStatutorySets().catch((error) => { console.warn("statutory scales not loaded, coded scale applies", error?.message || error); });
  const rows = await fetchPayrollRateRows();
  setPayrollRateOverrides(rows.filter((r) => PAYROLL_RATE_KEYS.includes(r.key)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PAYROLL_RATES_EVENT));
  return rows;
}

export async function savePayrollRate({ key, effectiveFrom, value, note }) {
  const { error } = await withTimeout(
    supabase.rpc("set_payroll_rate", { p_rate_key: key, p_effective_from: effectiveFrom, p_value: value, p_note: note || null }),
    12000,
  );
  if (error) throw error;
}

export async function deletePayrollRate({ key, effectiveFrom }) {
  const { error } = await withTimeout(
    supabase.rpc("delete_payroll_rate", { p_rate_key: key, p_effective_from: effectiveFrom }),
    12000,
  );
  if (error) throw error;
}

// Manager layout gate: true once the first read settled (success or failure), so the first calculation of a
// session already uses the owner's rates. Later changes reach the code through loadPayrollRates().
export function usePayrollRatesReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPayrollRates()
      .catch((error) => { console.warn("payroll rates not loaded, coded rates apply", error?.message || error); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  return ready;
}

// ── Reminder before a known change ────────────────────────────────────────────────────────────
// A rate whose new value starts within the next 4 weeks raises a badge on Configuration and a note on the
// « Taux » page: « 4 semaines » (15–28 days), « 2 semaines » (≤ 14 days) and « semaine précédente » (≤ 7 days).
// Known changes = the dated values built into the code + the rows the owner entered that have not started.
export const RATE_ALERT_DAYS = 28;

const dayNumber = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000);

export function rateAlertStage(daysLeft) {
  return daysLeft <= 7 ? 1 : daysLeft <= 14 ? 2 : 4;
}

// today: YYYY-MM-DD (Montréal). overrides: rows { key, effectiveFrom }. Sorted by date.
export function upcomingRateChanges(today, overrides = [], windowDays = RATE_ALERT_DAYS) {
  const dates = new Map(); // `${key}|${date}` → { key, date }
  const add = (key, date) => { if (date) dates.set(`${key}|${date}`, { key, date: String(date).slice(0, 10) }); };
  for (const r of MEDIC_RATES) { add("medic_employee_per_hour", r.effectiveFrom); add("medic_employer_per_hour", r.effectiveFrom); }
  for (const r of MEDIC_TAX_RATES) add("medic_tax_rate", r.effectiveFrom);
  for (const r of overrides) add(r.key, r.effectiveFrom);
  const now = dayNumber(today);
  return [...dates.values()]
    .map(({ key, date }) => ({ key, date, daysLeft: dayNumber(date) - now }))
    .filter((c) => c.daysLeft > 0 && c.daysLeft <= windowDays)
    .map((c) => ({ ...c, stage: rateAlertStage(c.daysLeft) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

// Number of known changes starting within the window (for the menu badge); refreshed after an owner edit.
export function usePayrollRateAlerts() {
  const [changes, setChanges] = useState(() => upcomingRateChanges(companyDate(), getPayrollRateOverrides()));
  useEffect(() => {
    const refresh = () => setChanges(upcomingRateChanges(companyDate(), getPayrollRateOverrides()));
    refresh();
    window.addEventListener(PAYROLL_RATES_EVENT, refresh);
    return () => window.removeEventListener(PAYROLL_RATES_EVENT, refresh);
  }, []);
  return changes;
}

// ── Yearly statutory scales (« Barèmes annuels », 0131) ───────────────────────────────────────
export async function fetchStatutorySets() {
  const { data, error } = await withTimeout(
    supabase.from("statutory_rate_sets").select("tax_year, data, note, updated_at").order("tax_year").limit(50),
    10000,
  );
  if (error) throw error;
  return data || [];
}

// Reads and installs the sets that validate; returns { sets, rejected } (rejected = [{ year, problems }]).
export async function loadStatutorySets() {
  const sets = await fetchStatutorySets();
  const rejected = setRuleSetOverrides(sets);
  if (rejected.length) console.warn("statutory scales rejected", rejected.map((r) => r.year).join(", "));
  return { sets, rejected };
}

export async function saveStatutorySet({ taxYear, data, note }) {
  const problems = validateRuleData(data);
  if (problems.length) throw new Error(problems[0]);
  const { error } = await withTimeout(
    supabase.rpc("set_statutory_rate_set", { p_tax_year: taxYear, p_data: data, p_note: note || null }),
    12000,
  );
  if (error) throw error;
}

export async function deleteStatutorySet(taxYear) {
  const { error } = await withTimeout(supabase.rpc("delete_statutory_rate_set", { p_tax_year: taxYear }), 12000);
  if (error) throw error;
}

// The pay year whose scale is missing soon: from 28 days before 1 January until the owner enters it (and
// after 1 January while it is still missing). null = nothing to do.
export function missingScaleAlert(today = companyDate(), years = availableRuleYears()) {
  const thisYear = Number(today.slice(0, 4));
  const jan1 = dayNumber(`${thisYear + 1}-01-01`);
  const now = dayNumber(today);
  if (!years.includes(thisYear)) return { year: thisYear, daysLeft: 0, stage: 1 };
  if (!years.includes(thisYear + 1) && jan1 - now <= RATE_ALERT_DAYS) {
    const daysLeft = jan1 - now;
    return { year: thisYear + 1, daysLeft, stage: rateAlertStage(daysLeft) };
  }
  return null;
}

export function useMissingScaleAlert() {
  const [alert, setAlert] = useState(() => missingScaleAlert());
  useEffect(() => {
    const refresh = () => setAlert(missingScaleAlert());
    refresh();
    window.addEventListener(PAYROLL_RATES_EVENT, refresh);
    return () => window.removeEventListener(PAYROLL_RATES_EVENT, refresh);
  }, []);
  return alert;
}
