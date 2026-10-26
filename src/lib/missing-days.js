// « Jours sans aucun job entré »: Avancé › Journal › Employés (V2) and Temps › Jours sans saisie (V3).
// Completed work days only (today excluded; weekends and CCQ non-worked days never count), from
// MISSING_ENTRY_TRACKING_START, for the regular crew; full-day leave excused.
import { supabase } from "@/supabaseClient";
import { loadHolidayDates } from "@/lib/company-holidays";
import { MISSING_ENTRY_TRACKING_START, missingEntryDays } from "@/lib/live-crew";

async function fetchAll(makeQuery) {
  const all = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await makeQuery().range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    all.push(...(result.data || []));
    if ((result.data || []).length < pageSize) return all;
  }
}

// employees = profiles (id, full_name, email, role, is_paused, show_on_boards, start_date).
export async function loadMissingEntryDays({ employees, startDate, endDate }) {
  const ids = employees.map((e) => e.id);
  const from = startDate < MISSING_ENTRY_TRACKING_START ? MISSING_ENTRY_TRACKING_START : startDate;
  if (!ids.length || from > endDate) return missingEntryDays(employees, [], [], from, endDate);
  const [jobs, timeOff, holidays] = await Promise.all([
    fetchAll(() => supabase.from("jobs").select("user_id, job_date").in("user_id", ids).gte("job_date", from).lte("job_date", endDate).order("job_date")),
    fetchAll(() => supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").in("user_id", ids).lte("start_date", endDate).or(`end_date.gte.${from},end_date.is.null`).order("start_date")),
    loadHolidayDates(),
  ]);
  return missingEntryDays(employees, jobs, timeOff, from, endDate, holidays);
}
