import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Statutory holidays (company_holidays, readable by every signed-in user) for the payroll
// engine's `holidayDates` option: work on those days is paid at 2× from the first hour
// (convention ICI 21.02 b). Loaded once per session; a failed load is retried on next call.
let cached = null;

export function loadHolidayDates() {
  if (!cached) {
    cached = Promise.resolve(supabase.from("company_holidays").select("holiday_date"))
      .then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((row) => String(row.holiday_date).slice(0, 10));
      })
      .catch((error) => {
        cached = null;
        console.warn("[SparkLog] company holidays not loaded; holiday double time not applied", error);
        return [];
      });
  }
  return cached;
}

// Same list for render-time calculations. Empty until loaded (then the caller re-renders).
export function useHolidayDates() {
  const [dates, setDates] = useState([]);
  useEffect(() => {
    let active = true;
    loadHolidayDates().then((list) => { if (active) setDates(list); });
    return () => { active = false; };
  }, []);
  return dates;
}
