// « À traiter › OCR »: what the reader (Edge function process_overtime_evidence) found on each overtime proof screenshot, next
// to what the work order says, so a manager can see every reading and the differences at a glance. Read only.
import { expectedProofForJob, proofDifferences } from "./overtime-proof-check";

// The OCR tab starts with the per-work-order proofs (owner decision 2026-11-18: nothing before 16 November).
export const OCR_FIRST_DAY = "2026-11-16";

// The form « Temps réel de TS » was replaced on 2026-11-23: from that day an old-form capture is not a valid proof (« Vieux Form »).
// Earlier days keep reading it as a normal proof.
export const OLD_FORM_INVALID_FROM = "2026-11-23";

export const OCR_STATES = ["ok", "incomplete", "mismatch", "sms", "field", "oldForm", "wrongDoc", "unread", "failed", "queued", "notRead"];

// States where the picture is NOT a valid proof of the overtime: nothing is compared.
export const INVALID_PROOF_STATES = new Set(["sms", "field", "oldForm", "wrongDoc"]);

// The result column compares the proof with the Sparklog timesheet only (Britton is compared in the « Par OT » view):
// "fiche" = the proof differs from the timesheet, null = no gap. Pictures that are not a valid proof are never compared.
export function gapOf(row) {
  if (!row || INVALID_PROOF_STATES.has(row.state)) return null;
  return row.state === "mismatch" || (row.wrong?.size ?? 0) > 0 ? "fiche" : null;
}

// The employee's name is green only when everything agrees (the proof is a valid, read one and no source differs).
export const allAgree = (row) => row?.state === "ok" && !gapOf(row);

// `evidence` = overtime_evidence rows; `jobs` = the work orders of those days; `people` = Map of user id -> profile.
// One row per proof, newest first. state: ok (nothing differs), mismatch (a value differs), unread (read, nothing found),
// sms (the screenshot of the approval TEXT MESSAGE: not the form, not a valid proof, nothing to compare),
// wrongDoc (the picture is not the overtime form: a work order, a receipt…),
// queued (waiting in the reading queue, one reading a minute),
// failed (out of attempts: the reading service did not answer, e.g. too many requests: nothing was read, it can be read again),
// notRead (older proof: the reader never looked at it).
export function buildOcrRows(evidence, jobs, people) {
  const byId = new Map((jobs || []).map((job) => [job.id, job]));
  const byDay = new Map();
  for (const job of jobs || []) {
    const key = `${job.user_id}|${String(job.job_date).slice(0, 10)}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(job);
  }
  const rows = [];
  for (const proof of evidence || []) {
    const job = byId.get(proof.job_id) || null;
    const userId = proof.user_id || job?.user_id || null;
    const jobDate = String(proof.job_date || job?.job_date || "").slice(0, 10);
    const person = people?.get?.(userId) || null;
    const found = { ot: proof.proof_ot ?? null, clientMinutes: proof.proof_client_minutes ?? null, returnMinutes: proof.proof_return_minutes ?? null };
    // An OT number alone is not a reading of the proof: what the proof proves is the minutes (at the client / return). A capture that
    // gave an OT but no minutes (question 1 only, or the answers could not be read) is « unread », never « conform ».
    const nothingFound = found.clientMinutes === null && found.returnMinutes === null;
    const expected = job
      ? expectedProofForJob(byDay.get(`${userId}|${jobDate}`) || [], job, { firstTripUnpaid: Boolean(person?.first_trip_unpaid), tenHourDay: Boolean(person?.ten_hour_days) })
      : null;
    const oldForm = proof.form_kind === "old" && jobDate >= OLD_FORM_INVALID_FROM;
    const diffs = proof.proof_read_at && !["failed", "pending", "wrong_document", "sms"].includes(proof.ocr_status) && !oldForm && !nothingFound ? proofDifferences(found, expected) : [];
    let state = "ok";
    if (proof.ocr_status === "wrong_document") state = proof.form_kind === "field" ? "field" : "wrongDoc";
    else if (proof.ocr_status === "sms") state = "sms";
    else if (oldForm && proof.proof_read_at) state = "oldForm";
    else if (proof.ocr_status === "pending") state = "queued";
    else if (!proof.proof_read_at) state = "notRead";
    else if (proof.ocr_status === "failed") state = "failed";
    else if (nothingFound) state = "unread";
    else if (diffs.length) state = "mismatch";
    rows.push({
      id: proof.id, jobId: proof.job_id, userId, name: (person?.full_name || "").trim(), jobDate, createdAt: proof.created_at,
      readAt: proof.proof_read_at || null, storagePath: proof.storage_path || "", jobOt: job?.ot ? String(job.ot) : "", jobStatus: job?.status || "",
      ocrStatus: proof.ocr_status || "", formKind: proof.form_kind || null, notNeeded: Boolean(proof.not_needed_at), job, attempts: Number(proof.ocr_attempts) || 0, nextTryAt: proof.ocr_next_try_at || null, found, expected, state, wrong: new Set(diffs.map((diff) => diff.field)),
    });
  }
  markIncomplete(rows);
  return rows.sort((a, b) => b.jobDate.localeCompare(a.jobDate) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

// The form of November 2026 has two answers (question 2 « at the client », question 3 « return »), often on two captures. A capture of the
// new form that looks « conform » is only conform when, between all the captures of its job, BOTH answers were read: a job whose
// captures never gave the return (or the client time) is « incomplete », not conform. Only « ok » rows change; a difference stays a difference.
function markIncomplete(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.formKind !== "new" || !row.jobId) continue;
    if (!groups.has(row.jobId)) groups.set(row.jobId, []);
    groups.get(row.jobId).push(row);
  }
  for (const members of groups.values()) {
    const read = members.filter((row) => row.state === "ok" || row.state === "mismatch" || row.state === "incomplete");
    const hasClient = read.some((row) => row.found.clientMinutes != null);
    const hasReturn = read.some((row) => row.found.returnMinutes != null);
    if (hasClient && hasReturn) continue;
    for (const row of members) if (row.state === "ok") row.state = "incomplete";
  }
}

// A manager can ask the reader to look again at a proof it failed on or found nothing on.
export const canReread = (row) => row.state === "failed" || row.state === "unread" || row.state === "wrongDoc";

// Any reading can be read again (0150), as long as its picture is kept and it is not already waiting in the queue.
export const canRequeue = (row) => Boolean(row.storagePath) && row.state !== "queued";

// `state`: "all" | "read" (every proof the reader looked at) | one of OCR_STATES | "check" (mismatch + wrong document + unread + failed) | "reread".
// `day`: "" (every day) or a date YYYY-MM-DD (the work date of the job).
export function filterOcrRows(rows, { state = "read", query = "", day = "" } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (day && row.jobDate !== day) return false;
    if (state === "read" && (row.state === "notRead" || row.state === "queued")) return false;
    if (state === "check" && row.state !== "mismatch" && row.state !== "incomplete" && !INVALID_PROOF_STATES.has(row.state) && row.state !== "unread" && row.state !== "failed" && !gapOf(row)) return false;
    if (state === "reread" && !canReread(row)) return false;
    if (OCR_STATES.includes(state) && row.state !== state) return false;
    if (!needle) return true;
    return `${row.name} ${row.jobOt} ${row.found.ot ?? ""} ${row.jobDate}`.toLowerCase().includes(needle);
  });
}

export function countOcrStates(rows) {
  const counts = { ok: 0, incomplete: 0, mismatch: 0, sms: 0, field: 0, oldForm: 0, wrongDoc: 0, unread: 0, failed: 0, queued: 0, notRead: 0 };
  for (const row of rows || []) counts[row.state] += 1;
  return counts;
}

// The work dates present in the readings, most recent first, with how many readings each has (for the day filter).
export function ocrDays(rows) {
  const counts = new Map();
  for (const row of rows || []) if (row.jobDate) counts.set(row.jobDate, (counts.get(row.jobDate) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, count]) => ({ date, count }));
}

// The proofs of one work order (the form has two answers, often two captures) go together in the table: one group per job.
// « 1 » is the capture that shows the OT and the time at the client (questions 1 and 2), « 2 » the one with the return
// (question 3): a capture that reads the OT comes first, then one that reads the time at the client, then the oldest.
// A proof without a job stays alone. Groups keep the order of their first row.
const captureRank = (row) => {
  if (row.found?.ot) return 0;
  if (row.found?.clientMinutes != null) return 1;
  if (row.found?.returnMinutes != null) return 2;
  return 3; // nothing read yet: after the ones that told what they are
};

export function groupProofRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.jobId ? `job:${row.jobId}` : `proof:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, members]) => ({
    key,
    rows: [...members].sort((a, b) => captureRank(a) - captureRank(b)
      || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id))),
  }));
}
