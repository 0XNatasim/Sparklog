// « OT déjà utilisé » (migration 0108): for the submitted jobs a manager screen shows, ask the database
// which other jobs carry the same OT number. Best effort: on an error (e.g. the migration is not
// applied yet) the other anomalies still show, without this one.
import { supabase } from "../supabaseClient";

export const OT_REUSE_CHUNK = 1000; // ot_reuse_for_jobs reads at most 1000 job ids per call

export async function loadOtReuse(jobIds, signal) {
  const ids = [...new Set((jobIds || []).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < ids.length; i += OT_REUSE_CHUNK) {
    let query = supabase.rpc("ot_reuse_for_jobs", { p_job_ids: ids.slice(i, i + OT_REUSE_CHUNK) });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      console.warn("[SparkLog] OT reuse check unavailable", error);
      return rows;
    }
    rows.push(...(data || []));
  }
  return rows;
}
