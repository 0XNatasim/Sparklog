// Classify a job code (the `ot` field on a job) by its leading letters, so the
// timesheet can tint non-numeric codes for quick scanning:
//   - "AD…"  → administration jobs  (light blue)
//   - "JOB…" → project jobs         (light green)
//   - anything else (e.g. a plain number) → no tint
//
// Matching is case-insensitive and ignores surrounding whitespace.

export function jobCodeKind(ot) {
  const s = String(ot || "").trim().toUpperCase();
  if (s.startsWith("AD")) return "admin";
  if (s.startsWith("JOB")) return "project";
  return null;
}

// Tailwind classes for the job card background + border by code kind. Kept as full
// literal strings (never built by concatenation) so Tailwind's content scanner emits
// them. Light, readable tints in light mode with a subtle equivalent in dark mode.
export function jobCodeTintClass(ot) {
  switch (jobCodeKind(ot)) {
    case "admin":
      return "bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900";
    case "project":
      return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900";
    default:
      return "";
  }
}
