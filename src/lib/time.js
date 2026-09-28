import dayjs from "dayjs";
import { minutesBetween } from "./payroll-calculations";

export function hhmmFromDayjs(value) {
  if (!value) return null;
  const d = dayjs(value);
  if (!d.isValid()) return null;
  return d.format("HH:mm");
}

/**
 * Returns exact decimal hours between start and end (e.g. 203 min -> 3.3833…).
 * Accepts Dayjs objects (or null).
 *
 * Not rounded: callers add several jobs together, and rounding each job to the
 * hundredth of an hour first (36 s) made a 510-minute day display as 8h29.
 * Round only when displaying the final total (formatHM / formatHours).
 */
export function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const s = dayjs(start);
  const e = dayjs(end);
  if (!s.isValid() || !e.isValid()) return 0;

  // Job times do not carry an end date, so the authoritative payroll engine
  // interprets an end time before the start as crossing midnight. Delegate to
  // that same calculation to keep employee and manager totals consistent.
  const workedMinutes = minutesBetween(s.format("HH:mm"), e.format("HH:mm"));
  return workedMinutes / 60;
}

export function formatHours(hours) {
  if (!hours || hours <= 0) return "0.00";
  return hours.toFixed(2);
}

// Duration in wall-clock style, e.g. 3.55h -> "3h33". Clearer than decimal hours
// for a worked-time total (matches the Live Crew view).
export function formatHM(hours) {
  const minutes = Math.max(0, Math.round((hours || 0) * 60));
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
