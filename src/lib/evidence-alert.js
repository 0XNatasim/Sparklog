// Alert « justificatifs pas encore téléchargés » (migration 0129): the proofs kept in the app and not downloaded yet that
// are EVIDENCE_ALERT_DAYS days old or more (21), or deleted within 3 days. Counts come from one RPC (managers only).
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";

export const EVIDENCE_ALERT_DAYS = 21;
export const EVIDENCE_ALERT_EVENT = "sparklog:evidence-alert";
const NONE = Object.freeze({ total: 0, overtime: 0, parking: 0, oldestDays: 0, daysLeft: null });

export async function fetchEvidenceAlert() {
  const { data, error } = await withTimeout(supabase.rpc("evidence_download_alert", { p_days: EVIDENCE_ALERT_DAYS }), 12000);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NONE;
  return {
    total: Number(row.total) || 0,
    overtime: Number(row.overtime) || 0,
    parking: Number(row.parking) || 0,
    oldestDays: Number(row.oldest_days) || 0,
    daysLeft: row.days_left === null || row.days_left === undefined ? null : Number(row.days_left),
  };
}

// The alert for a manager session; a failed read shows nothing rather than a wrong number. Refreshed after a download.
export function useEvidenceAlert() {
  const [alert, setAlert] = useState(NONE);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchEvidenceAlert().then((value) => { if (!cancelled) setAlert(value); }, () => undefined);
    load();
    window.addEventListener(EVIDENCE_ALERT_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(EVIDENCE_ALERT_EVENT, load); };
  }, []);
  return alert;
}
