import dayjs from "dayjs";
import { minutesBetween } from "./payroll-calculations";

export function hhmmFromDayjs(value) {
  if (!value) return null;
  const d = dayjs(value);
  if (!d.isValid()) return null;
  return d.format("HH:mm");
}

/**
 * Returns decimal hours between start and end (e.g. 7.50).
 * Accepts Dayjs objects (or null).
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
  return Math.round((workedMinutes / 60) * 100) / 100;
}

export function formatHours(hours) {
  if (!hours || hours <= 0) return "0.00";
  return hours.toFixed(2);
}
