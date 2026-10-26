// Gestion V3: the number on « À traiter » in the menu — the submitted jobs still waiting for approval
// (the weeks paid by Dynacom are closed and not listed, like on the page). One count-only request
// (no rows), made when the page changes and when À traiter reloads (TODO_EVENT).
import { supabase } from "@/supabaseClient";
import { DYNACOM_CUMULATIVE_END } from "@/lib/payroll-opening";

export const TODO_EVENT = "sparklog:todo-refresh";

export async function fetchTodoCount() {
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .gt("job_date", DYNACOM_CUMULATIVE_END);
  if (error) throw error;
  return count || 0;
}
