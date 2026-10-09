import { addCalendarDays, companyDate } from "./company-time";
import { jobDurationMinutes, MAX_JOB_DURATION_MINUTES } from "./job-contract";

// Owner emergency timesheet: the owner creates a draft job for an employee, who must
// confirm it before it can be submitted. Keep the window in step with
// create_job_for_employee (migration 0075).
export const MANAGER_ENTRY_WINDOW_DAYS = 31;
export const MANAGER_ENTRY_NOTE_MIN = 3;
export const MANAGER_ENTRY_NOTE_MAX = 500;

// Selectable work dates: today and the previous MANAGER_ENTRY_WINDOW_DAYS days (company time).
export function managerEntryDateRange(today = companyDate()) {
  return { min: addCalendarDays(today, -MANAGER_ENTRY_WINDOW_DAYS), max: today };
}

// Draft created by an owner that the employee has not confirmed yet.
export function isPendingManagerEntry(job) {
  return Boolean(job?.manager_entry_at)
    && !job.employee_confirmed_at
    && (job.status === "saved" || job.status === "updated")
    && job.locked === false;
}

// pending → employee still has to validate; submitted/approved → already in the normal circuit.
export function managerEntryState(job) {
  if (!job?.manager_entry_at) return null;
  if (job.status === "approved") return "approved";
  if (job.status === "submitted") return "submitted";
  return "pending";
}

// Returns the list of invalid field keys (empty when the form can be sent).
export function validateManagerEntry(values, today = companyDate()) {
  const errors = [];
  const { min, max } = managerEntryDateRange(today);
  if (!values.employeeId) errors.push("employee");
  if (!values.jobDate || values.jobDate < min || values.jobDate > max) errors.push("date");
  if (!String(values.ot || "").trim()) errors.push("ot");
  if (!values.depart) errors.push("depart");
  if (!values.fin) errors.push("fin");
  const duration = jobDurationMinutes(values.depart, values.fin);
  if (values.depart && values.fin && (duration === null || duration <= 0 || duration > MAX_JOB_DURATION_MINUTES)) {
    errors.push("interval");
  }
  const km = String(values.km ?? "").trim();
  if (km !== "" && !(Number(km.replace(",", ".")) >= 0)) errors.push("km");
  const note = String(values.note || "").trim();
  if (note.length < MANAGER_ENTRY_NOTE_MIN || note.length > MANAGER_ENTRY_NOTE_MAX) errors.push("note");
  return errors;
}

// Explicit client-to-RPC contract: the owner never supplies status, lock or ownership.
export function buildCreateJobForEmployeeArgs(values, submissionKey) {
  const km = String(values.km ?? "").trim();
  return {
    p_employee_id: values.employeeId,
    p_submission_key: submissionKey,
    p_job_date: values.jobDate,
    p_ot: String(values.ot || "").trim(),
    p_depart: values.depart || null,
    p_arrivee: values.arrivee || null,
    p_fin: values.fin || null,
    p_km_aller: km === "" ? 0 : Number(km.replace(",", ".")),
    p_note: String(values.note || "").trim(),
  };
}
