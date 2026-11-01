import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";
import {
  CCQ_CAISSE_EDUCATION_PER_HOUR, CCQ_ELECTRICIAN_IC_C3, CCQ_PRELEVEMENT_RATE, PAYROLL_RATE_KEYS,
  medicRatesOn, medicTaxRateOn, setPayrollRateOverrides,
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
  const rows = await fetchPayrollRateRows();
  setPayrollRateOverrides(rows.filter((r) => PAYROLL_RATE_KEYS.includes(r.key)));
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
