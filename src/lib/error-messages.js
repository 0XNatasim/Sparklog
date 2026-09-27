// Database/job-contract error codes shown to employees as translated sentences.
const CODE_MESSAGES = [
  [/ambiguous_montreal_local_time|invalid_dst_time:ambiguous/i, "form.errors.ambiguousTime"],
  [/nonexistent_montreal_local_time|invalid_dst_time:nonexistent/i, "form.errors.nonexistentTime"],
  [/overlapping_job_interval/i, "form.errors.overlappingInterval"],
  [/return_time_exceeds_job_interval|return_exceeds_interval/i, "form.errors.returnExceedsInterval"],
  [/invalid_job_kilometres|invalid_kilometres/i, "form.errors.invalidKilometres"],
  [/invalid_job_interval|invalid_job_contract|invalid_interval/i, "form.errors.invalidInterval"],
  [/job_not_editable/i, "form.errors.notEditable"],
  [/entry deadline for this work date has passed/i, "form.errors.dayClosed"],
  [/cannot be entered for a company holiday/i, "form.errors.holidayClosed"],
];

const NETWORK_PATTERN = /failed to fetch|networkerror|network request failed|load failed|timed out/i;

export function isNetworkError(error) {
  const name = error?.name || "";
  const message = String(error?.message || error || "");
  return name === "AbortError" || name === "TimeoutError" || NETWORK_PATTERN.test(message);
}

// Offline failures are already explained by the offline banner, so screens hide them.
export function isOfflineError(error) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline && isNetworkError(error);
}

export function friendlyErrorMessage(error, t, fallbackKey) {
  if (isOfflineError(error)) return t("offline.banner");
  if (isNetworkError(error)) return t("common.errors.network");
  const message = String(error?.message || error || "");
  const match = CODE_MESSAGES.find(([pattern]) => pattern.test(message));
  if (match) return t(match[1]);
  if (message) console.error("[error]", error);
  return t(fallbackKey);
}
