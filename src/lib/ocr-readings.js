// « À traiter › OCR »: what the reader (Edge function process_overtime_evidence) found on each overtime proof screenshot, next
// to what the work order says, so a manager can see every reading and the differences at a glance. Read only.
import { expectedProofForJob, proofDifferences } from "./overtime-proof-check";

// The OCR tab starts with the per-work-order proofs (owner decision 2026-11-18: nothing before 16 November).
export const OCR_FIRST_DAY = "2026-11-16";

export const OCR_STATES = ["ok", "mismatch", "wrongDoc", "unread", "failed", "queued", "notRead"];

// `evidence` = overtime_evidence rows; `jobs` = the work orders of those days; `people` = Map of user id -> profile.
// One row per proof, newest first. state: ok (nothing differs), mismatch (a value differs), unread (read, nothing found),
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
    const nothingFound = found.ot === null && found.clientMinutes === null && found.returnMinutes === null;
    const expected = job
      ? expectedProofForJob(byDay.get(`${userId}|${jobDate}`) || [], job, { firstTripUnpaid: Boolean(person?.first_trip_unpaid), tenHourDay: Boolean(person?.ten_hour_days) })
      : null;
    const diffs = proof.proof_read_at && !["failed", "pending", "wrong_document"].includes(proof.ocr_status) && !nothingFound ? proofDifferences(found, expected) : [];
    let state = "ok";
    if (proof.ocr_status === "wrong_document") state = "wrongDoc";
    else if (proof.ocr_status === "pending") state = "queued";
    else if (!proof.proof_read_at) state = "notRead";
    else if (proof.ocr_status === "failed") state = "failed";
    else if (nothingFound) state = "unread";
    else if (diffs.length) state = "mismatch";
    rows.push({
      id: proof.id, jobId: proof.job_id, userId, name: (person?.full_name || "").trim(), jobDate, createdAt: proof.created_at,
      readAt: proof.proof_read_at || null, storagePath: proof.storage_path || "", jobOt: job?.ot ? String(job.ot) : "", jobStatus: job?.status || "",
      ocrStatus: proof.ocr_status || "", job, attempts: Number(proof.ocr_attempts) || 0, nextTryAt: proof.ocr_next_try_at || null, found, expected, state, wrong: new Set(diffs.map((diff) => diff.field)),
    });
  }
  return rows.sort((a, b) => b.jobDate.localeCompare(a.jobDate) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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
    if (state === "check" && row.state !== "mismatch" && row.state !== "wrongDoc" && row.state !== "unread" && row.state !== "failed") return false;
    if (state === "reread" && !canReread(row)) return false;
    if (OCR_STATES.includes(state) && row.state !== state) return false;
    if (!needle) return true;
    return `${row.name} ${row.jobOt} ${row.found.ot ?? ""} ${row.jobDate}`.toLowerCase().includes(needle);
  });
}

export function countOcrStates(rows) {
  const counts = { ok: 0, mismatch: 0, wrongDoc: 0, unread: 0, failed: 0, queued: 0, notRead: 0 };
  for (const row of rows || []) counts[row.state] += 1;
  return counts;
}

// The work dates present in the readings, most recent first, with how many readings each has (for the day filter).
export function ocrDays(rows) {
  const counts = new Map();
  for (const row of rows || []) if (row.jobDate) counts.set(row.jobDate, (counts.get(row.jobDate) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, count]) => ({ date, count }));
}
