// Silent-failure checks returned by the system_health_checks() RPC (migration 0132).
// Pure helpers: the RPC decides ok / warn / bad, this file only names and sorts them.
export const HEALTH_CHECK_IDS = ["cron_failed", "cron_stale", "evidence_overdue", "export_stuck", "rates_stale"];

const RANK = { bad: 0, warn: 1, ok: 2 };

// Known checks only, worst first, so a new server-side id never shows an untranslated row.
export function normalizeHealthChecks(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row) => row && HEALTH_CHECK_IDS.includes(row.id) && row.status in RANK)
    .map((row) => ({ id: row.id, status: row.status, value: row.value ?? null }))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || HEALTH_CHECK_IDS.indexOf(a.id) - HEALTH_CHECK_IDS.indexOf(b.id));
}

export function healthSummary(checks) {
  const bad = checks.filter((c) => c.status === "bad").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  return { bad, warn, ok: bad === 0 && warn === 0 && checks.length > 0 };
}
