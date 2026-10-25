// Small helpers of the employee time entry (src/pages/EmployeeForm.jsx).
import dayjs from "dayjs";

// Delays (seconds) between automatic resends of a save that failed on a network/server outage.
export const AUTO_RESEND_DELAYS_S = [15, 30, 60, 120, 240];

export function fmtTimeHHmm(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

export function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

export function toHHmmLabelFromFormatHours(formatHoursResult) {
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

export function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function isEditableStatus(s) {
  return s === "saved" || s === "updated";
}

export function formatReturnMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} h`;
  return `${hours} h ${remainder}`;
}
