// Gestion › Communications: the messages sent (newest first) and, for each, who received it and who read it.
// The recipients are read page by page: PostgREST returns 1 000 rows at most and silently drops the rest, and the table holds one
// row per message and per person (1 737 rows in November 2026): a single read lost the readings of the newest messages, which then
// showed nobody had read them. The rows are ordered by their key so that the pages never overlap.
// `scheduled_for` (migration 0163) is read when the column exists: before the migration the same query without it is used.
import { fetchAllRows } from "@/lib/fetch-all";

const BASE = "id, body, audience, image_path, attachments, created_at, edited_at";

export async function fetchBroadcastLog(client) {
  const recipients = fetchAllRows(() => client.from("broadcast_recipients")
    .select("broadcast_id, employee_id, acknowledged_at, withdrawn_at")
    .order("broadcast_id", { ascending: true })
    .order("employee_id", { ascending: true }));
  let log = await client.from("manager_broadcasts").select(`${BASE}, scheduled_for`).order("created_at", { ascending: false });
  if (log.error) log = await client.from("manager_broadcasts").select(BASE).order("created_at", { ascending: false });
  return [log, await recipients];
}
