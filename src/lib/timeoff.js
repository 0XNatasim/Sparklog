// Time-off (congés) helpers shared by the per-employee panel, the dedicated Congés
// section, and LiveCrew. One source of truth for formatting and "is this person off on
// date X?" so every surface agrees.
import dayjs from "dayjs";

// dayjs().day(): 0 = Sunday … 6 = Saturday. Keep this order for weekdays[] storage.
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Weekday order for pickers: Monday-first (Québec work week), mapped back to 0..6 values.
export const WEEKDAY_PICKER = [1, 2, 3, 4, 5, 6, 0];

const hm = (t) => (t ? String(t).slice(0, 5) : "");

// Human label for one time-off row, in the active language.
export function formatTimeOff(row, t) {
  if (row.kind === "recurring_weekly") {
    const days = (row.weekdays || [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => t(`timeOff.weekdaysShort.${WEEKDAY_KEYS[d]}`))
      .join(", ");
    const until = row.end_date ? ` (${t("timeOff.untilLabel")} ${dayjs(row.end_date).format("DD MMM YYYY")})` : "";
    const exceptions = (row.exception_dates || []).slice().sort();
    const exceptionsLabel = exceptions.length
      ? ` — ${t("timeOff.exceptionsLabel")} ${exceptions.map((e) => dayjs(e).format("DD MMM YYYY")).join(", ")}`
      : "";
    return `${t("timeOff.recurringLabel", { days })}${until}${exceptionsLabel}`;
  }
  const sameDay = row.start_date === row.end_date;
  const base = sameDay
    ? dayjs(row.start_date).format("DD MMM YYYY")
    : `${dayjs(row.start_date).format("DD MMM")} – ${dayjs(row.end_date).format("DD MMM YYYY")}`;
  if (row.start_time && row.end_time) return `${base} · ${hm(row.start_time)}–${hm(row.end_time)}`;
  return base;
}

// Would a recurring_weekly row's weekday + date bounds apply to this date, ignoring any
// exceptions? Shared by isOffOn (to know the rule fires) and by the UI (to validate that a
// candidate exception date actually falls on one of the recurring days).
export function matchesRecurrence(row, dateStr) {
  const d = dayjs(dateStr);
  if (row.start_date && d.isBefore(dayjs(row.start_date), "day")) return false;
  if (row.end_date && d.isAfter(dayjs(row.end_date), "day")) return false;
  return (row.weekdays || []).includes(d.day());
}

// Is this date carved out as an exception to a recurring rule that would otherwise apply —
// i.e. the employee is normally off this weekday, but not on this particular occurrence?
export function isExceptionOn(row, dateStr) {
  if (row.kind !== "recurring_weekly") return false;
  if (!(row.exception_dates || []).includes(dateStr)) return false;
  return matchesRecurrence(row, dateStr);
}

// Is the employee off on a given YYYY-MM-DD, per this row?
export function isOffOn(row, dateStr) {
  if (row.kind === "recurring_weekly") {
    if (isExceptionOn(row, dateStr)) return false;
    return matchesRecurrence(row, dateStr);
  }
  const d = dayjs(dateStr);
  const start = dayjs(row.start_date);
  const end = dayjs(row.end_date || row.start_date);
  return !d.isBefore(start, "day") && !d.isAfter(end, "day");
}

// Time-off categories (informational — no pay effect). Value stored in employee_time_off.category.
export const TIME_OFF_CATEGORIES = ["conge", "vacances", "absence", "temps_partiel"];
export const DEFAULT_CATEGORY = "conge";

// Label for a category in the active language.
export function categoryLabel(category, t) {
  return t(`timeOff.categories.${TIME_OFF_CATEGORIES.includes(category) ? category : DEFAULT_CATEGORY}`);
}

// Columns to select wherever a row is read, so the helpers above have what they need.
export const TIME_OFF_COLUMNS = "id, user_id, category, kind, start_date, end_date, start_time, end_time, weekdays, exception_dates, note";
