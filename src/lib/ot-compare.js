// À traiter › OCR › « Par OT »: for each overtime work order, the three sources side by side — what Britton approved (imported
// table, 0156), what the employee wrote on the request form (the proof screenshot, read by OCR) and what the Sparklog
// timesheet says — with one verdict, so a manager sees at once what needs attention. Read only; pure logic + two loaders.
import { PROOF_CLIENT_TOLERANCE_MIN, PROOF_RETURN_TOLERANCE_MIN, expectedProofForJob, otDigits } from "./overtime-proof-check";
import { DAILY_REGULAR_MINUTES, TEN_HOUR_DAY_MINUTES, dayFirstTripUnpaidMinutes, minutesBetween } from "./payroll-calculations";
import { byDepart, overtimeLineJobIds } from "./overtime-proof-rules";
import { BRITTON_WINDOW_DAYS, dayDiff, nameKey, shiftDay } from "./britton";
import { fetchAllRows } from "./fetch-all";
import { QUERY_BUDGETS } from "./query-budgets";
import { withTimeout } from "./utils";

// Worst first. missingSparklog: Britton approved it, Sparklog has no such work order that day. missingBritton: Sparklog has the
// overtime, Britton has no line (minutes we are not reimbursed for). brittonGap: Britton and the timesheet disagree.
// formGap: Britton and the timesheet agree, the form says something else. noProof: they agree but no proof was sent. ok: all agree.
export const VERDICTS = ["missingSparklog", "missingBritton", "brittonGap", "formGap", "noProof", "ok"];
const RANK = Object.fromEntries(VERDICTS.map((verdict, index) => [verdict, index]));
const FIELDS = ["client", "return"];
const TOLERANCE = { client: PROOF_CLIENT_TOLERANCE_MIN, return: PROOF_RETURN_TOLERANCE_MIN };
const near = (a, b, field) => Math.abs(a - b) <= TOLERANCE[field];
const day = (value) => String(value ?? "").slice(0, 10);
const READ_STATES = new Set(["ok", "mismatch"]);

// Per field, which sources are the odd one out: a source is red when it disagrees with at least one other source and agrees with
// fewer of them than the best-agreeing source does (two sources that differ are both red).
function oddOnes(values, field) {
  const present = Object.entries(values).filter(([, value]) => value && value[field] != null);
  if (present.length < 2) return [];
  const agree = present.map(([, value]) => present.filter(([, other]) => other !== value && near(value[field], other[field], field)).length);
  if (agree.every((count) => count === present.length - 1)) return []; // everybody agrees with everybody
  const best = Math.max(...agree);
  return present.filter((_, index) => (best === 0 ? true : agree[index] < best)).map(([source]) => source);
}

// `proofRows`: rows of buildOcrRows (the proofs); `britton`: lines of britton_overtime; `jobs`: the work orders of the Britton days
// (all employees); `people`: Map of user id -> { full_name, first_trip_unpaid, ten_hour_days }. Only days that have at least one
// Britton line are compared (on a day Britton did not send, every overtime would look « missing »).
export function buildOtComparison({ proofRows = [], britton = [], jobs = [], people = new Map() }) {
  // The days Britton sent lines for (the day a line ends); the work of a line is the same day or up to BRITTON_WINDOW_DAYS earlier.
  const days = new Set(britton.map((line) => day(line.job_date)));
  const byDay = new Map();
  for (const job of jobs) {
    if (!job.user_id) continue;
    const key = `${job.user_id}|${day(job.job_date)}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(job);
  }

  const entries = new Map();
  const jobInfo = new Map();
  const ensure = (key, base) => {
    if (!entries.has(key)) entries.set(key, { key, proofs: [], britton: null, ...base });
    return entries.get(key);
  };
  const entryOf = (info, extra = {}) => ensure(`job:${info.job.id}`, { userId: info.userId, jobDate: info.jobDate, name: info.name, job: info.job, expected: info.expected, ...extra });

  // 1. Sparklog: the work orders past the line of each employee-day, with what the timesheet says they should read. On a day Britton
  // sent nothing for, an entry is only kept if a Britton line ends up pointing at it (weak entry).
  for (const [key, dayJobs] of byDay) {
    const [userId, jobDate] = key.split("|");
    const person = people.get(userId) || null;
    const options = { firstTripUnpaid: Boolean(person?.first_trip_unpaid), tenHourDay: Boolean(person?.ten_hour_days) };
    const sorted = dayJobs.filter((job) => job.depart && job.fin).sort(byDepart);
    const lineIds = overtimeLineJobIds(sorted, {
      minutesOf: (job) => minutesBetween(job.depart, job.fin) - (Number(job.return_time_minutes) || 0),
      thresholdMinutes: options.tenHourDay ? TEN_HOUR_DAY_MINUTES : DAILY_REGULAR_MINUTES,
      unpaidTripMinutes: options.firstTripUnpaid ? dayFirstTripUnpaidMinutes(sorted) : 0,
    });
    for (const job of dayJobs) {
      const info = { job, userId, jobDate, name: (person?.full_name || "").trim(), expected: expectedProofForJob(dayJobs, job, options) };
      jobInfo.set(job.id, info);
      if (lineIds.has(job.id) && days.has(jobDate)) entryOf(info);
    }
  }

  // 2. The proofs (form captures), each on its own work order.
  for (const row of proofRows) {
    const info = jobInfo.get(row.jobId);
    const covered = days.has(day(row.jobDate));
    if (!info && !covered) continue;
    const entry = info
      ? entryOf(info, covered || entries.has(`job:${row.jobId}`) ? {} : { weak: true })
      : ensure(`proof:${row.id}`, { userId: row.userId, jobDate: day(row.jobDate), name: row.name, job: row.job || null, expected: row.expected || null });
    entry.proofs.push(row);
  }

  // 3. Britton lines. A line matches the work order with the same OT whose day is the line's day or up to two days before; the same
  // name wins, then the closest day. A work order under the line (or on a day Britton did not send) that a line points at joins the
  // comparison too; one that no line ends up on is dropped again.
  const inWindow = (line, jobDate) => { const lag = dayDiff(jobDate, day(line.job_date)); return lag >= 0 && lag <= BRITTON_WINDOW_DAYS; };
  for (const line of britton) {
    for (const info of jobInfo.values()) {
      if (otDigits(info.job.ot) === line.ot && inWindow(line, info.jobDate)) entryOf(info, entries.has(`job:${info.job.id}`) ? {} : { weak: true });
    }
  }
  const byOt = new Map();
  for (const entry of entries.values()) {
    const ot = otDigits(entry.job?.ot) || otDigits(entry.proofs[0]?.jobOt) || otDigits(entry.proofs[0]?.found?.ot);
    entry.ot = ot;
    if (!ot) continue;
    if (!byOt.has(ot)) byOt.set(ot, []);
    byOt.get(ot).push(entry);
  }
  const candidatesOf = (line) => (byOt.get(line.ot) || []).filter((entry) => !entry.britton && inWindow(line, entry.jobDate))
    .sort((a, b) => dayDiff(a.jobDate, day(line.job_date)) - dayDiff(b.jobDate, day(line.job_date)));
  const lines = [...britton].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const leftover = [];
  for (const line of lines) {
    const named = candidatesOf(line).find((entry) => nameKey(entry.name) === line.name_key);
    if (named) named.britton = line; else leftover.push(line);
  }
  const unmatched = [];
  for (const line of leftover) {
    const candidates = candidatesOf(line);
    const sameOt = leftover.filter((other) => other.ot === line.ot);
    if (candidates.length === 1 && sameOt.length === 1) candidates[0].britton = line; // names differ (spelling), OT and days agree
    else unmatched.push(line);
  }
  for (const [key, entry] of entries) if (entry.weak && !entry.britton) entries.delete(key);
  for (const line of unmatched) {
    entries.set(`britton:${line.id}`, { key: `britton:${line.id}`, proofs: [], britton: line, userId: null, jobDate: day(line.job_date), name: line.employee_name, job: null, expected: null, ot: line.ot });
  }

  // Why a line may not match, so a manager sees it at a glance: the OT was done the day(s) before, the employee has the OT on another
  // day, the OT number looks wrong (the employee's other OT of those days are listed), or the other side has a line for the same person.
  const infosByName = new Map();
  for (const info of jobInfo.values()) {
    const key = nameKey(info.name);
    if (!key) continue;
    if (!infosByName.has(key)) infosByName.set(key, []);
    infosByName.get(key).push(info);
  }
  const linesByName = new Map(); // every Britton line of a person, matched or not
  for (const line of britton) linesByName.set(line.name_key, [...(linesByName.get(line.name_key) || []), line]);
  const nearLinesOf = (entry) => (linesByName.get(nameKey(entry.name)) || []).filter((line) => inWindow(line, entry.jobDate));
  const remarkOf = (entry) => {
    if (entry.britton && entry.job) {
      const lag = dayDiff(entry.jobDate, day(entry.britton.job_date));
      return lag > 0 ? { kind: "earlier", days: lag } : null;
    }
    if (entry.britton) { // a Britton line no work order matches
      const line = entry.britton;
      const theirs = infosByName.get(line.name_key) || [];
      const elsewhere = theirs.find((info) => otDigits(info.job.ot) === line.ot);
      if (elsewhere) return { kind: "otOtherDay", day: elsewhere.jobDate };
      const nearby = [...new Set(theirs.filter((info) => inWindow(line, info.jobDate)).map((info) => String(info.job.ot || "").trim()).filter(Boolean))];
      return nearby.length ? { kind: "wrongOt", ots: nearby.slice(0, 6) } : { kind: "noSheet" };
    }
    if (entry.job && !entry.britton) { // a timesheet overtime Britton has no line for, while Britton has a line for the same person nearby
      const lines = nearLinesOf(entry);
      return lines.length ? { kind: "brittonOt", ots: [...new Set(lines.map((line) => line.ot))].slice(0, 6) } : null;
    }
    return null;
  };

  // 4. Values, odd ones out and verdict.
  const out = [];
  for (const entry of entries.values()) {
    const proofs = [...entry.proofs].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const read = proofs.find((row) => READ_STATES.has(row.state) && (row.found?.clientMinutes != null || row.found?.returnMinutes != null));
    const sparklog = entry.job && entry.expected ? { client: entry.expected.clientMinutes, return: entry.expected.returnMinutes } : null;
    const brittonValues = entry.britton ? { client: entry.britton.client_minutes, return: entry.britton.return_minutes } : null;
    const form = read ? { client: read.found.clientMinutes ?? null, return: read.found.returnMinutes ?? null } : null;
    const values = { britton: brittonValues, form, sparklog };
    const red = { britton: new Set(), form: new Set(), sparklog: new Set() };
    for (const field of FIELDS) for (const source of oddOnes(values, field)) red[source].add(field);

    let verdict;
    if (!sparklog) verdict = "missingSparklog";
    else if (!brittonValues) verdict = "missingBritton";
    else if (FIELDS.some((field) => !near(brittonValues[field], sparklog[field], field))) verdict = "brittonGap";
    else if (form && FIELDS.some((field) => form[field] != null && !near(form[field], sparklog[field], field))) verdict = "formGap";
    else if (proofs.every((row) => row.state === "sms")) verdict = "noProof"; // no proof, or only the screenshot of the text message (not a valid proof)
    else verdict = "ok";

    out.push({ ...entry, brittonDay: entry.britton ? day(entry.britton.job_date) : "", remark: remarkOf(entry), personInBritton: Boolean(entry.job && !entry.britton && nearLinesOf(entry).length), proofs, proof: proofs[0] || null, sparklog, form, britton: entry.britton, brittonValues, red, verdict, ot: entry.ot || otDigits(entry.job?.ot) || "", jobOt: entry.job?.ot ? String(entry.job.ot) : "" });
  }
  return out.sort((a, b) => b.jobDate.localeCompare(a.jobDate) || RANK[a.verdict] - RANK[b.verdict] || String(a.name).localeCompare(String(b.name)) || String(a.ot).localeCompare(String(b.ot)));
}

export function countVerdicts(entries) {
  const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0]));
  for (const entry of entries || []) counts[entry.verdict] += 1;
  return counts;
}

// `verdict`: "all" | "attention" (everything but ok) | one of VERDICTS. `day`: "" or YYYY-MM-DD.
export function filterComparison(entries, { verdict = "attention", day: dayFilter = "", query = "" } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  return (entries || []).filter((entry) => {
    if (dayFilter && entry.jobDate !== dayFilter && entry.brittonDay !== dayFilter) return false; // the work day or the day Britton's line ends
    if (verdict === "attention" && entry.verdict === "ok") return false;
    if (VERDICTS.includes(verdict) && entry.verdict !== verdict) return false;
    return !needle || `${entry.name} ${entry.ot} ${entry.jobOt}`.toLowerCase().includes(needle);
  });
}

// The days Britton ended lines on, most recent first.
export const brittonDays = (britton) => [...new Set((britton || []).map((line) => day(line.job_date)))].sort().reverse();

// The days whose work orders are read: each Britton day and the two days before it (a line ends the work day or shortly after).
export const comparisonDays = (britton) => [...new Set(brittonDays(britton).flatMap((date) => Array.from({ length: BRITTON_WINDOW_DAYS + 1 }, (_, back) => shiftDay(date, -back))))].sort().reverse();

const JOB_COLUMNS = "id, user_id, job_date, status, ot, depart, arrivee, fin, return_time_minutes, km_total, km_aller, km_retour";
const JOB_STATUSES = ["saved", "updated", "submitted", "approved"];

// The work orders of every employee on those days (paged) and the profiles they belong to.
export async function fetchComparisonData(client, days) {
  if (!days.length) return { jobs: [], people: new Map(), truncated: false };
  const { data, error, truncated } = await fetchAllRows(
    () => client.from("jobs").select(JOB_COLUMNS).in("job_date", days).in("status", JOB_STATUSES).order("id"),
    { maxRows: QUERY_BUDGETS.otComparisonJobs },
  );
  if (error) throw error;
  const jobs = data || [];
  const ids = [...new Set(jobs.map((job) => job.user_id).filter(Boolean))];
  const people = new Map();
  for (let i = 0; i < ids.length; i += QUERY_BUDGETS.inListChunk) {
    const { data: part, error: peopleError } = await withTimeout(
      client.from("profiles").select("id, full_name, first_trip_unpaid, ten_hour_days").in("id", ids.slice(i, i + QUERY_BUDGETS.inListChunk)), 12000);
    if (peopleError) throw peopleError;
    for (const person of part || []) people.set(person.id, person);
  }
  return { jobs, people, truncated: Boolean(truncated) };
}
