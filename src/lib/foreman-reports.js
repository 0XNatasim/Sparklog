import { matchPreset } from "@/lib/preset-work-orders";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { withTimeout } from "@/lib/utils";

// Foreman reports (0134): a foreman auditing the other employees writes a short report from his time entry
// when the work order is « CONTREMAÎTRE »; the managers read them in Notes › Contremaître.
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

// Sends one report. `submissionKey` is created once per report, so a retry after a lost response (the unique key
// answers 23505) is the same report, not a second one.
export async function submitForemanReport(client, { userId, submissionKey, reportDate, auditedName, body }) {
  const clean = cleanReport({ auditedName, body });
  if (!clean || !userId || !submissionKey || !reportDate) throw new Error("foreman_report_invalid");
  const { error } = await withTimeout(
    client.from("foreman_reports").insert({
      user_id: userId,
      submission_key: submissionKey,
      report_date: reportDate,
      audited_name: clean.auditedName,
      body: clean.body,
    }),
    12000,
  );
  if (error && error.code !== "23505") throw error;
}

// The managers' list: newest first, each report with its author's name. Throws on a read error.
export async function fetchForemanReports(client) {
  const { data, error } = await withTimeout(
    client.from("foreman_reports")
      .select("id, user_id, report_date, audited_name, body, created_at")
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
  return (reports || []).filter((report) => fold(`${report.author} ${report.audited_name} ${report.body}`).includes(needle));
}
