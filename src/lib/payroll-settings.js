import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { DEFAULT_EMPLOYER } from "@/payroll/employee-week";
import { WORKFORCE_FUND } from "@/payroll/rules/2026.js";

// Employer payroll parameters (Paramètres › Paie, table payroll_employer_settings) and the
// per-employee TD1 / TP-1015.3 amounts, fixed weekly pay and EI exemption (employee_tax_profiles),
// shaped for the engine.

// DB row → the engine's `employer` input. A missing CNESST rate stays undefined so the
// calculation reports requires_review rather than guessing one.
export function employerFromSettings(row) {
  if (!row) return DEFAULT_EMPLOYER;
  const payroll = row.annual_payroll_estimate == null ? 0 : Number(row.annual_payroll_estimate) || 0;
  const per100 = row.cnesst_rate_per_100;
  return {
    annualPayrollEstimate: payroll,
    fssCategory: row.fss_category || "general",
    // Per 100 $ → fraction, kept to the notice's 4 decimals (5,63 → 0,0563).
    cnesstRate: per100 == null || per100 === "" ? undefined : Math.round(Number(per100) * 10000) / 1000000,
    workforceSkillsFundApplicable: payroll > WORKFORCE_FUND.payrollThreshold,
  };
}

// DB row → the engine's tax-profile amounts. Null claim = basic personal amount.
export function taxProfileFromRow(row) {
  if (!row) return null;
  const num = (v) => (v == null || v === "" ? undefined : Number(v));
  return {
    td1ClaimAmount: num(row.td1_claim_amount),
    federalAdditionalTax: Number(row.federal_additional_tax) || 0,
    personalTaxCredits: num(row.tp1015_3_credits),
    quebecAdditionalTax: Number(row.quebec_additional_tax) || 0,
    // Fixed weekly pay (migration 0091): hours paid every week from fixedPayStart, whatever the jobs.
    fixedWeeklyHours: Number(row.fixed_weekly_hours) || 0,
    fixedPayStart: row.fixed_pay_start || "",
    eiExempt: Boolean(row.ei_exempt),
  };
}

export async function loadEmployerSettings() {
  const { data, error } = await supabase.from("payroll_employer_settings").select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

// Map user_id → engine tax profile.
export async function loadTaxProfiles() {
  const { data, error } = await supabase.from("employee_tax_profiles").select("*");
  if (error) throw error;
  return new Map((data || []).map((row) => [row.user_id, taxProfileFromRow(row)]));
}

// Employer settings + tax profiles for render-time payroll previews (Talon, DAS). Defaults until
// loaded; a failed load (e.g. missing migration) keeps the defaults and logs a warning.
export function usePayrollSettings() {
  const [state, setState] = useState({ employer: DEFAULT_EMPLOYER, taxProfiles: new Map(), loaded: false });
  useEffect(() => {
    let active = true;
    Promise.all([loadEmployerSettings(), loadTaxProfiles()])
      .then(([row, taxProfiles]) => { if (active) setState({ employer: employerFromSettings(row), taxProfiles, loaded: true }); })
      .catch((error) => {
        console.warn("[SparkLog] payroll settings not loaded; using defaults", error);
        if (active) setState((s) => ({ ...s, loaded: true }));
      });
    return () => { active = false; };
  }, []);
  return state;
}
