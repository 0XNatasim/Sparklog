import dayjs from "dayjs";

// ─────────────────────────────────────────────────────────────────────────────
// CCQ pay-week helpers — one source of truth for the app.
//
// The CCQ pay week runs SUNDAY → SATURDAY, keyed by the Saturday that ends it
// (the same grouping used by the manager dashboard, the payroll engine and the CCQ
// export). Week NUMBERS follow the CCQ calendar, where week 1 of a year ends on the
// LAST SATURDAY OF THE PREVIOUS DECEMBER.
//
// Confirmed against Simon Bellerive's stub D0033-0007: the period Sun 2026-08-30 →
// Sat 2026-09-05 is week 37, which requires week 1 of 2026 to be Sun 2025-12-21 →
// Sat 2025-12-27 (the last Saturday of 2025). Verify other years against the official
// CCQ pay-week calendar before finalized use.
// ─────────────────────────────────────────────────────────────────────────────

// The Saturday that ends the CCQ week containing `date` (returns a dayjs).
export function weekEndingSaturdayD(date) {
  const d = dayjs(date);
  return d.add((6 - d.day() + 7) % 7, "day");
}

// The Sunday that starts the CCQ week containing `date` (returns a dayjs).
export function weekStartSundayD(date) {
  return weekEndingSaturdayD(date).subtract(6, "day");
}

// The last Saturday of December of `year` (returns a dayjs).
function lastSaturdayOfDecember(year) {
  const dec31 = dayjs(new Date(year, 11, 31));
  return dec31.subtract((dec31.day() - 6 + 7) % 7, "day");
}

// CCQ week 1 of a calendar `year` ends on the last Saturday of the previous December.
function ccqWeek1End(year) {
  return lastSaturdayOfDecember(year - 1);
}

// CCQ week number + CCQ year for a date. Week 1 ends on the last Saturday of the
// previous December, so late-December weeks can belong to the NEXT CCQ year.
export function ccqWeekInfo(date) {
  const end = weekEndingSaturdayD(date);
  let year = end.year() + 1; // start above and walk down to the owning CCQ year
  while (ccqWeek1End(year).isAfter(end)) year -= 1;
  const weekNo = Math.round(end.diff(ccqWeek1End(year), "day") / 7) + 1;
  return { weekNo, ccqYear: year };
}

// Convenience: just the CCQ week number for a date.
export function ccqWeekNumber(date) {
  return ccqWeekInfo(date).weekNo;
}
