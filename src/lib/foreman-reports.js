import { matchPreset } from "@/lib/preset-work-orders";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

// Foreman notes (0134, attached to the work sheet by 0136): a foreman auditing the other employees may add a short
// note to his time entry when the work order is « CONTREMAÎTRE ». The note follows the job (deleted with it, kept when
// the job is returned for correction); the managers read, delete and export the notes in Notes › Contremaître.
export const FOREMAN_OT_LABEL = "CONTREMAÎTRE";
export const MAX_REPORT = 5000;
export const MAX_AUDITED_NAME = 120;

// True when the work order text is the « CONTREMAÎTRE » choice (case and spaces ignored, like any preset).
export const isForemanOt = (ot) => Boolean(matchPreset(ot, [FOREMAN_OT_LABEL]));

const tidy = (value) => String(value ?? "").replace(/[ \t]+/g, " ").trim();

// The report as stored, or null when the table would refuse it (empty or too long text / name).
export function cleanReport({ auditedName, body }) {
  const text = String(body ?? "").replace(/\r\n/g, "\n").trim();
  const name = tidy(auditedName);
  if (!text || text.length > MAX_REPORT || name.length > MAX_AUDITED_NAME) return null;
  return { auditedName: name || null, body: text };
}

// Attaches the note to its job: one note per job, created the first time and edited afterwards. `submissionKey` is
// created once per note, so a retry after a lost response is the same note, not a second one.
export async function saveJobNote(client, { userId, jobId, submissionKey, reportDate, auditedName, body }) {
  const clean = cleanReport({ auditedName, body });
  if (!clean || !userId || !jobId || !submissionKey || !reportDate) throw new Error("foreman_report_invalid");
  const { data: existing, error: readError } = await withTimeout(
    client.from("foreman_reports").select("id").eq("job_id", jobId).maybeSingle(),
    12000,
  );
  if (readError) throw readError;
  if (existing?.id) {
    const { error } = await withTimeout(
      client.from("foreman_reports").update({ audited_name: clean.auditedName, body: clean.body }).eq("id", existing.id),
      12000,
    );
    if (error) throw error;
    return;
  }
  const { error } = await withTimeout(
    client.from("foreman_reports").insert({
      user_id: userId,
      job_id: jobId,
      submission_key: submissionKey,
      report_date: reportDate,
      audited_name: clean.auditedName,
      body: clean.body,
    }),
    12000,
  );
  if (error && error.code !== "23505") throw error;
}

// The note of a job (to edit it from the work sheet), or null.
export async function fetchJobNote(client, jobId) {
  const { data, error } = await withTimeout(
    client.from("foreman_reports").select("audited_name, body").eq("job_id", jobId).maybeSingle(),
    12000,
  );
  if (error) throw error;
  return data ? { auditedName: data.audited_name || "", body: data.body || "" } : null;
}

// A manager deletes a note on its own (the job stays).
export async function deleteForemanReport(client, id) {
  const { error } = await withTimeout(client.from("foreman_reports").delete().eq("id", id), 12000);
  if (error) throw error;
}

// A manager returns the job of a note for correction: the foreman edits the job and its note.
export async function returnReportedJob(client, job) {
  const { error } = await withTimeout(
    client.rpc("return_job_for_correction", { p_job_id: job.id, p_expected_updated_at: job.updated_at || null }),
    12000,
  );
  if (error) throw error;
}

// The managers' list: newest first, each report with its author's name. Throws on a read error.
export async function fetchForemanReports(client) {
  const { data, error } = await withTimeout(
    client.from("foreman_reports")
      .select("id, user_id, job_id, report_date, audited_name, body, created_at, updated_at, job:jobs(id, ot, job_date, depart, fin, status, updated_at)")
      .order("created_at", { ascending: false })
      .limit(QUERY_BUDGETS.foremanReports),
    12000,
  );
  if (error) throw error;
  const reports = data || [];
  const ids = [...new Set(reports.map((report) => report.user_id))];
  const names = new Map();
  if (ids.length) {
    const { data: people } = await withTimeout(client.from("profiles").select("id, full_name").in("id", ids), 12000);
    for (const person of people || []) names.set(person.id, (person.full_name || "").trim());
  }
  return reports.map((report) => ({ ...report, author: names.get(report.user_id) || "" }));
}

// Text search over the loaded reports: author, audited person, text (case and accents ignored).
const fold = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function filterReports(reports, query) {
  const needle = fold(query).trim();
  if (!needle) return reports;
  return (reports || []).filter((report) => fold(`${report.author} ${report.audited_name} ${report.body} ${report.job?.ot ?? ""}`).includes(needle));
}

const csvCell = (value) => {
  const text = String(value ?? "");
  // A leading = + - @ would be run as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// The notes as a CSV (; separated, like the accident register): one line per note with the work sheet it follows.
export function foremanReportsCsv(reports, labels) {
  const header = ["date", "author", "ot", "workDate", "times", "status", "audited", "note"];
  const lines = [header.map((key) => csvCell(labels.columns[key])).join(";")];
  for (const report of reports || []) {
    const job = report.job;
    lines.push([
      String(report.created_at || "").slice(0, 10),
      report.author,
      job?.ot ?? "",
      job?.job_date ?? report.report_date ?? "",
      job?.depart && job?.fin ? `${String(job.depart).slice(0, 5)}-${String(job.fin).slice(0, 5)}` : "",
      job ? (labels.status[job.status] || job.status) : "",
      report.audited_name,
      report.body,
    ].map(csvCell).join(";"));
  }
  return lines.join("\r\n");
}

// Read / unread state of the notes for the signed-in manager (0138). A note is unread until he opened it, and again
// once the foreman edited it after that.
export function isNoteUnread(note, readAt) {
  if (!note) return false;
  if (!readAt) return true;
  const changed = new Date(note.updated_at || note.created_at || 0).getTime();
  return new Date(readAt).getTime() < changed;
}

// { reportId → read_at } for these notes (RLS: only the caller's own readings come back).
export async function fetchNoteReads(client, reportIds) {
  const ids = [...new Set((reportIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await withTimeout(client.from("foreman_report_reads").select("report_id, read_at").in("report_id", ids), 12000);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.report_id, row.read_at]));
}

export async function markNoteRead(client, reportId) {
  const { error } = await withTimeout(
    client.from("foreman_report_reads").upsert({ report_id: reportId }, { onConflict: "report_id,manager_id" }),
    12000,
  );
  if (error) throw error;
}
