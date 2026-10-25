// Everything weeklyCosts (src/lib/employer-cost.js) needs for a date range: profiles, jobs, supper and
// parking claims, CCQ per-hour rates, payroll settings, day rounding, and the opening YTD (ledger +
// seeds) of the tax years the range touches. Shared by Coûts and Rapports › Semaine / Mois.
import { supabase } from "@/supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { COUNTED_CLAIM_STATUSES } from "@/lib/claim-status";
import { loadHolidayDates } from "@/lib/company-holidays";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { employerFromSettings, loadEmployerSettings, loadTaxProfiles } from "@/lib/payroll-settings";
import { COST_JOB_STATUSES, openingLookup, taxYearsFor } from "@/lib/employer-cost";

const PROFILE_COLUMNS = "id, full_name, email, role, hourly_rate, hourly_rate_double, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, union_association, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid";
const JOB_COLUMNS = "id, user_id, job_date, ot, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes, hourly_rate_snapshot, team_leader_premium_snapshot, km_rate_snapshot, status";

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

export async function loadCostInputs({ start, end }) {
  const years = taxYearsFor(start, end);
  const [profiles, jobs, meals, parking, contributions, seeds, ledger, employerRow, taxProfiles, holidayDates, rounding] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).then(unwrap),
    fetchAllRows(() => supabase.from("jobs").select(JOB_COLUMNS).in("status", COST_JOB_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    fetchAllRows(() => supabase.from("meal_claims").select("id, user_id, job_date, amount").in("status", COUNTED_CLAIM_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    fetchAllRows(() => supabase.from("parking_receipts").select("id, user_id, job_date, amount").in("status", COUNTED_CLAIM_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    supabase.from("employer_contributions").select("*").eq("active", true).order("sort_order", { ascending: true }).then(unwrap),
    supabase.from("payroll_ytd").select("*").in("tax_year", years).then(unwrap),
    fetchAllRows(() => supabase.from("payroll_period_ledger").select("*").in("tax_year", years).lt("period_end", end).order("period_end", { ascending: true }).order("user_id")).then(unwrap),
    // Settings missing or unreadable: the engine's defaults (CNESST then needs review), as on the talons.
    loadEmployerSettings().catch(() => null),
    loadTaxProfiles().catch(() => new Map()),
    loadHolidayDates(),
    loadDayRounding({ untilDate: end }),
  ]);
  return {
    start, end, profiles, jobs, meals, parking, contributions, holidayDates, taxProfiles,
    employer: employerFromSettings(employerRow),
    openingFor: openingLookup({ ledger, seeds }),
    roundingFor: (userId) => roundingFor(rounding, userId),
  };
}
