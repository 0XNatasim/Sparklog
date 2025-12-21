import dayjs from "dayjs";

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

  const diffMinutes = e.diff(s, "minute");
  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
}

export function formatHours(hours) {
  if (!hours || hours <= 0) return "0.00";
  return hours.toFixed(2);
}
