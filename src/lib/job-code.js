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
      return "bg-info/10 border-info/30";
    case "project":
      return "bg-success/10 border-success/30";
    default:
      return "";
  }
}
