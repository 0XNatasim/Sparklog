import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { companyDate } from "@/lib/company-time";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";
import { calendarBlocks } from "@/lib/ccq-calendar";

// One read per day and per page load (the banner sits in AppShell, which every page mounts); a failed
// read is retried on the next call.
let cache = { today: "", promise: null };

function loadCalendar(today) {
  if (cache.today !== today || !cache.promise) {
    const promise = Promise.resolve(withTimeout(
      supabase.from("company_holidays").select("holiday_date, label").gte("holiday_date", today).order("holiday_date").limit(QUERY_BUDGETS.ccqCalendar),
      12000,
    ))
      .then(({ data, error }) => {
        if (error) throw error;
        return calendarBlocks(data);
      })
      .catch(() => { if (cache.promise === promise) cache = { today: "", promise: null }; return []; });
    cache = { today, promise };
  }
  return cache.promise;
}

// Hook: { blocks, today, loaded }. A failed read leaves the list empty (the card then says nothing is published).
export function useCcqCalendar() {
  const [blocks, setBlocks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const today = companyDate();
  useEffect(() => {
    let alive = true;
    loadCalendar(today).then((list) => { if (alive) { setBlocks(list); setLoaded(true); } });
    return () => { alive = false; };
  }, [today]);
  return { blocks, today, loaded };
}
