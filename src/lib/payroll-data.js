// Everything « Paie et coûts › Semaine / Mois » needs for a range of CCQ weeks, loaded once:
// profiles, the year's jobs up to the last week, posted weeks (ledger), opening seeds, payroll
// settings, holidays, day rounding, employer contribution rates and the supper / parking claims.
// `computeFor` returns the compute() of planPayrollWeek: the same Talon calculation everywhere.
import { fetchAllRows } from "@/lib/fetch-all";
import { loadHolidayDates } from "@/lib/company-holidays";
import { employerFromSettings, loadEmployerSettings, loadTaxProfiles } from "@/lib/payroll-settings";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { computeEmployeeWeekTalon, YTD_COLUMN_TO_KEY, YTD_CCQ_COLUMN_TO_KEY } from "@/payroll/employee-week";
import { TAX_YEAR } from "@/lib/payroll-week";

const PROFILE_COLUMNS = "id, full_name, role, hourly_rate, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid";
const LEDGER_COLUMNS = ["user_id", "period_end", "period_start", "talon_seq", "boss_approved", ...[...YTD_COLUMN_TO_KEY, ...YTD_CCQ_COLUMN_TO_KEY].map(([, col]) => col)].join(", ");
// Supper and parking claims count in the employer cost like on the printed summary.
const CLAIM_STATUSES = ["pending", "approved"];

const unwrap = (res) => {
  if (res.error) throw res.error;
  return res.data || [];
};

// start / end: first Sunday and last Saturday of the weeks shown. keptFor: a week end whose kept
// talons (imported or comptabilisés) are also loaded, for printing.
export async function loadPayrollData(supabase, { start, end, keptFor = null }) {
  const [profiles, jobs, seeds, ledger, kept, settingsRow, taxProfiles, holidayDates, rounding, contributions, meals, parking] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).then(unwrap),
    fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, status, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes").gte("job_date", `${TAX_YEAR}-01-01`).lte("job_date", end).order("id")).then(unwrap),
    supabase.from("payroll_ytd").select("*").eq("tax_year", TAX_YEAR).then(unwrap),
    fetchAllRows(() => supabase.from("payroll_period_ledger").select(LEDGER_COLUMNS).eq("tax_year", TAX_YEAR).order("period_end").order("user_id")).then(unwrap),
    keptFor
      ? supabase.from("payroll_period_ledger").select("user_id, imported_talon").eq("tax_year", TAX_YEAR).eq("period_end", keptFor).then(unwrap)
      : Promise.resolve([]),
    loadEmployerSettings(),
    loadTaxProfiles(),
    loadHolidayDates(),
    loadDayRounding({ untilDate: end }),
    supabase.from("employer_contributions").select("*").eq("active", true).order("sort_order", { ascending: true }).then(unwrap),
    fetchAllRows(() => supabase.from("meal_claims").select("id, user_id, job_date, amount").in("status", CLAIM_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    fetchAllRows(() => supabase.from("parking_receipts").select("id, user_id, job_date, amount").in("status", CLAIM_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
  ]);
  const ledgerByUser = new Map();
  for (const row of ledger) {
    if (!ledgerByUser.has(row.user_id)) ledgerByUser.set(row.user_id, []);
    ledgerByUser.get(row.user_id).push(row);
  }
  return {
    start, end, profiles, jobs, ledgerByUser, taxProfiles, holidayDates, rounding, contributions, meals, parking,
    seedByUser: new Map(seeds.map((row) => [row.user_id, row])),
    keptByUser: new Map(kept.filter((row) => row.imported_talon).map((row) => [row.user_id, row.imported_talon])),
    employer: employerFromSettings(settingsRow),
  };
}

// planPayrollWeek / planPayrollMonth arguments for loaded data (`messier` = Méthode Messier).
export function planArgs(data, { messier = false } = {}) {
  return {
    profiles: data.profiles,
    jobs: data.jobs,
    ledgerByUser: data.ledgerByUser,
    seedByUser: data.seedByUser,
    taxProfiles: data.taxProfiles,
    contributions: data.contributions,
    meals: data.meals,
    parking: data.parking,
    compute: (profile, approved, opening, week) => computeEmployeeWeekTalon({
      profile, jobs: approved, opening, frequency: "weekly", includePhone: true, includeStorage: true,
      weekDate: week.start, messierMethod: messier, holidayDates: data.holidayDates, employer: data.employer,
      taxProfile: data.taxProfiles.get(profile.id), rounding: roundingFor(data.rounding, profile.id),
    }),
  };
}
