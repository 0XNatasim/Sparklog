import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { companyDate } from "@/lib/company-time";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";
import { calendarBlocks } from "@/lib/ccq-calendar";

// Hook: { blocks, today, loaded }. A failed read leaves the list empty (the card then says nothing is published).
export function useCcqCalendar() {
  const [blocks, setBlocks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const today = companyDate();
  useEffect(() => {
    let alive = true;
    Promise.resolve(withTimeout(
      supabase.from("company_holidays").select("holiday_date, label").gte("holiday_date", today).order("holiday_date").limit(QUERY_BUDGETS.ccqCalendar),
      12000,
    ))
      .then(({ data, error }) => { if (alive && !error) setBlocks(calendarBlocks(data)); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [today]);
  return { blocks, today, loaded };
}
