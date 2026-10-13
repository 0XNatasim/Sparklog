// Supabase/PostgREST returns at most `max_rows` rows per request (1000 by default) and
// silently drops the rest. Every report that reads an open-ended set of rows (all
// employees over weeks or months) goes through fetchAllRows so a total is never computed
// on a truncated list.
//
// `makeQuery` must build a FRESH query each call, ordered on a unique tiebreaker (e.g.
// .order("id")) so pages do not overlap. Returns the same { data, error } shape as a
// single Supabase query, so it drops into an existing Promise.all.
export const PAGE_SIZE = 1000;

export async function fetchAllRows(makeQuery, { pageSize = PAGE_SIZE, maxRows = 100000 } = {}) {
  const rows = [];
  const seen = new Set();
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    for (const row of page) {
      // A row inserted between two pages can shift the window: never count it twice.
      const key = row?.id ?? null;
      if (key != null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
    if (page.length < pageSize) return { data: rows, error: null };
  }
  return { data: rows, error: null, truncated: true };
}
