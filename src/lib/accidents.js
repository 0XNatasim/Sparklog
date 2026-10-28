import { supabase } from "@/supabaseClient";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

// Registre d'accidents (0120): managers only. A file is closed, never deleted.
export const ACCIDENT_KINDS = Object.freeze(["injury", "near_miss", "property", "vehicle"]);
export const ACCIDENT_SEVERITIES = Object.freeze(["first_aid", "medical", "lost_time", "critical"]);
// Sent after a save so the menu badge (open files) refreshes without a reload.
export const ACCIDENT_EVENT = "sparklog:accidents-changed";
export const ACCIDENT_STATUSES = Object.freeze(["open", "closed"]);

export const ACCIDENT_COLUMNS = "id, occurred_on, occurred_time, employee_id, person_name, kind, severity, location, description, witnesses, treatment, lost_days, cnesst_claim, corrective_actions, status, closed_at, created_at, updated_at";

export const MAX_ACCIDENT = Object.freeze({ person: 120, description: 4000, location: 300, witnesses: 1000, treatment: 1000, claim: 60, actions: 2000, lostDays: 1000 });

export function emptyAccident(today) {
  return {
    occurred_on: today, occurred_time: "", employee_id: "", person_name: "", kind: "injury", severity: "first_aid",
    location: "", description: "", witnesses: "", treatment: "", lost_days: "", cnesst_claim: "", corrective_actions: "", status: "open",
  };
}

// The form of an existing row (nulls become empty fields).
export function accidentToForm(row) {
  return {
    ...emptyAccident(row.occurred_on),
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ""])),
    occurred_time: row.occurred_time ? String(row.occurred_time).slice(0, 5) : "",
    lost_days: row.lost_days ?? "",
  };
}

// Keys of the invalid fields (empty = can be saved). The person is the picked employee or a typed name.
export function validateAccident(form) {
  const errors = [];
  if (!form.occurred_on) errors.push("occurred_on");
  if (!String(form.person_name || "").trim() || String(form.person_name).trim().length > MAX_ACCIDENT.person) errors.push("person_name");
  const description = String(form.description || "").trim();
  if (description.length < 3 || description.length > MAX_ACCIDENT.description) errors.push("description");
  if (!ACCIDENT_KINDS.includes(form.kind)) errors.push("kind");
  if (!ACCIDENT_SEVERITIES.includes(form.severity)) errors.push("severity");
  const lost = String(form.lost_days ?? "").trim();
  if (lost !== "" && !(Number.isInteger(Number(lost)) && Number(lost) >= 0 && Number(lost) <= MAX_ACCIDENT.lostDays)) errors.push("lost_days");
  for (const [field, max] of [["location", MAX_ACCIDENT.location], ["witnesses", MAX_ACCIDENT.witnesses], ["treatment", MAX_ACCIDENT.treatment], ["cnesst_claim", MAX_ACCIDENT.claim], ["corrective_actions", MAX_ACCIDENT.actions]]) {
    if (String(form[field] || "").length > max) errors.push(field);
  }
  return errors;
}

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

// Columns sent to the table (server-owned fields — author, stamps, closing — are never sent).
export function accidentPayload(form) {
  const lost = String(form.lost_days ?? "").trim();
  return {
    occurred_on: form.occurred_on,
    occurred_time: form.occurred_time || null,
    employee_id: form.employee_id || null,
    person_name: String(form.person_name).trim(),
    kind: form.kind,
    severity: form.severity,
    location: clean(form.location),
    description: String(form.description).trim(),
    witnesses: clean(form.witnesses),
    treatment: clean(form.treatment),
    lost_days: lost === "" ? null : Number(lost),
    cnesst_claim: clean(form.cnesst_claim),
    corrective_actions: clean(form.corrective_actions),
    status: form.status === "closed" ? "closed" : "open",
  };
}

const norm = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterAccidents(rows, { status = "all", kind = "all", search = "" } = {}) {
  const needle = norm(search).trim();
  return (rows || []).filter((row) => (status === "all" || row.status === status)
    && (kind === "all" || row.kind === kind)
    && (!needle || [row.person_name, row.location, row.description, row.cnesst_claim].some((field) => norm(field).includes(needle))));
}

export const openAccidentCount = (rows) => (rows || []).filter((row) => row.status === "open").length;

const csvCell = (value) => {
  const text = String(value ?? "");
  // A leading = + - @ would be run as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function accidentsCsv(rows, labels) {
  const header = ["date", "time", "person", "kind", "severity", "location", "description", "witnesses", "treatment", "lostDays", "claim", "actions", "status"];
  const lines = [header.map((key) => csvCell(labels.columns[key])).join(";")];
  for (const row of rows) {
    lines.push([
      row.occurred_on, row.occurred_time ? String(row.occurred_time).slice(0, 5) : "", row.person_name,
      labels.kind[row.kind] || row.kind, labels.severity[row.severity] || row.severity, row.location, row.description,
      row.witnesses, row.treatment, row.lost_days ?? "", row.cnesst_claim, row.corrective_actions, labels.status[row.status] || row.status,
    ].map(csvCell).join(";"));
  }
  return lines.join("\r\n");
}

export async function fetchAccidents() {
  const { data, error } = await withTimeout(
    supabase.from("accident_log").select(ACCIDENT_COLUMNS).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(QUERY_BUDGETS.accidentLog),
    12000,
  );
  if (error) throw error;
  return data || [];
}

// Side-menu badge: only the number of open files.
export async function fetchOpenAccidentCount() {
  const { count, error } = await withTimeout(
    supabase.from("accident_log").select("id", { count: "exact", head: true }).eq("status", "open"),
    12000,
  );
  if (error) throw error;
  return count || 0;
}

export async function createAccident(form) {
  const { data, error } = await withTimeout(supabase.from("accident_log").insert(accidentPayload(form)).select(ACCIDENT_COLUMNS).single(), 12000);
  if (error) throw error;
  return data;
}

export async function updateAccident(id, form) {
  const { data, error } = await withTimeout(supabase.from("accident_log").update(accidentPayload(form)).eq("id", id).select(ACCIDENT_COLUMNS).single(), 12000);
  if (error) throw error;
  return data;
}
