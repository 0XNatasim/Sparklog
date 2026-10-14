// How a new timesheet entry was filled (migration 0090, table job_entry_sources): from the Field
// Service screenshot (auto-fill) or by hand. Managers see a red star on manual entries.
// Informational only, so every call here is best effort: an error never blocks a save or a list.

export const ENTRY_SOURCES = Object.freeze({ screenshot: "screenshot", manual: "manual" });

// Records the source once per job (a retried save keeps the first row).
export async function recordEntrySource(client, { jobId, userId, source }) {
  if (!jobId || !userId || !Object.values(ENTRY_SOURCES).includes(source)) return;
  try {
    const { error } = await client.from("job_entry_sources")
      .upsert({ job_id: jobId, user_id: userId, source }, { onConflict: "job_id", ignoreDuplicates: true });
    if (error) console.warn("[entry-source] not recorded", error);
  } catch (error) {
    console.warn("[entry-source] not recorded", error);
  }
}

const CHUNK = 150; // ids per request, keeps the URL short

// Set of the given job ids that were entered by hand. Missing table or any error → empty set.
export async function loadManualEntryJobIds(client, jobIds, { signal } = {}) {
  const ids = [...new Set((jobIds || []).filter(Boolean))];
  const manual = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    try {
      let query = client.from("job_entry_sources").select("job_id")
        .eq("source", ENTRY_SOURCES.manual)
        .in("job_id", ids.slice(i, i + CHUNK));
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) return manual;
      for (const row of data || []) manual.add(row.job_id);
    } catch {
      return manual;
    }
  }
  return manual;
}
