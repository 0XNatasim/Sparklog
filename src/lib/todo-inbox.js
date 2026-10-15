import { getKilometreBreakdown, minutesBetween } from "./payroll-calculations";

// « À traiter » (Équipe en direct › V3): every submitted job grouped by employee and day,
// with what the manager decides on that day — overtime proof, supper claim, parking
// receipt — attached to it. Days touched by an anomaly are set apart so the bulk
// « Tout approuver sans anomalie » never approves them.

const dayKey = (userId, date) => `${userId}|${date}`;

function personName(profile, userId) {
  return profile?.full_name || profile?.email || String(userId || "").slice(0, 8);
}

// submittedJobs: jobs with status 'submitted'. anomalies: detectJobAnomalies() output.
// evidenceRows: overtime_evidence rows of those jobs. meals / parking: PENDING claims.
export function buildInbox({ submittedJobs = [], profiles = new Map(), anomalies = [], evidenceRows = [], meals = [], parking = [] }) {
  const days = new Map();
  const jobDay = new Map();
  for (const job of submittedJobs) {
    if (job.status !== "submitted") continue;
    const key = dayKey(job.user_id, job.job_date);
    if (!days.has(key)) {
      days.set(key, {
        key, userId: job.user_id, date: job.job_date, jobs: [],
        minutes: 0, km: 0, evidence: [], meals: [], parking: [], anomalies: [],
      });
    }
    const day = days.get(key);
    day.jobs.push(job);
    day.minutes += job.depart && job.fin ? minutesBetween(job.depart, job.fin) : 0;
    day.km += getKilometreBreakdown(job).totalKm;
    jobDay.set(job.id, day);
  }
  for (const day of days.values()) {
    day.jobs.sort((a, b) => String(a.depart || "").localeCompare(String(b.depart || "")) || String(a.id).localeCompare(String(b.id)));
  }

  for (const row of evidenceRows) jobDay.get(row.job_id)?.evidence.push(row);

  // A claim waiting on a day that is not (or no longer) submitted is still listed, apart.
  const orphanClaims = [];
  for (const claim of meals) {
    const day = days.get(dayKey(claim.user_id, claim.job_date));
    if (day) day.meals.push(claim);
    else orphanClaims.push({ kind: "meal", ...claim });
  }
  for (const receipt of parking) {
    const day = jobDay.get(receipt.job_id) || days.get(dayKey(receipt.user_id, receipt.job_date));
    if (day) day.parking.push(receipt);
    else orphanClaims.push({ kind: "parking", ...receipt });
  }

  for (const anomaly of anomalies) {
    const touched = new Set();
    for (const id of anomaly.jobIds || []) {
      const day = jobDay.get(id);
      if (day && !touched.has(day.key)) {
        touched.add(day.key);
        day.anomalies.push(anomaly);
      }
    }
  }

  const byDate = (a, b) => a.date.localeCompare(b.date) || personName(profiles.get(a.userId), a.userId).localeCompare(personName(profiles.get(b.userId), b.userId), "fr");
  const all = [...days.values()].sort(byDate);
  const anomalyDays = all.filter((day) => day.anomalies.length > 0);
  const cleanDays = all.filter((day) => day.anomalies.length === 0);

  const employeesMap = new Map();
  for (const day of cleanDays) {
    if (!employeesMap.has(day.userId)) {
      employeesMap.set(day.userId, { id: day.userId, name: personName(profiles.get(day.userId), day.userId), profile: profiles.get(day.userId) || null, days: [] });
    }
    employeesMap.get(day.userId).days.push(day);
  }
  const employees = [...employeesMap.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const pendingClaims = sumBy(all, (day) => day.meals.length + day.parking.length) + orphanClaims.length;
  return {
    anomalyDays,
    employees,
    orphanClaims: orphanClaims.sort((a, b) => String(a.job_date).localeCompare(String(b.job_date))),
    cleanJobIds: cleanDays.flatMap((day) => day.jobs.map((job) => job.id)),
    stats: {
      days: all.length,
      cleanDays: cleanDays.length,
      anomalyDays: anomalyDays.length,
      pendingClaims,
    },
  };
}

function sumBy(list, fn) {
  return list.reduce((sum, item) => sum + fn(item), 0);
}

// The submitted queue is read oldest first, up to a budget. When the budget cut the list, the
// last date read may be incomplete (some of its jobs were not returned): leave that date out so
// « Approuver la journée » never approves part of a day. Keeps everything when nothing was cut.
export function completeDaysOnly(jobs, truncated) {
  if (!truncated || !jobs.length) return jobs;
  const lastDate = jobs.reduce((max, job) => (job.job_date > max ? job.job_date : max), "");
  const kept = jobs.filter((job) => job.job_date < lastDate);
  return kept.length ? kept : jobs;
}

// Employee search on « À traiter »: accent- and case-insensitive match on the name or e-mail.
export function normalizeSearch(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function matchesPerson(profile, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${profile?.full_name || ""} ${profile?.email || ""}`).includes(q);
}

// The last weekday before `date` (YYYY-MM-DD): Monday looks back to Friday.
export function previousWorkday(date) {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

// push_approved_batch's per-job results → how many were approved and which ones changed
// under the manager (edited since, already claimed…) and must be looked at again.
export function approvalOutcome(data, jobIds) {
  if (!Array.isArray(data?.results)) {
    // Older deployments return counts only: trust them only when they cover every job.
    return Number(data?.exported || 0) + Number(data?.skipped || 0) >= jobIds.length
      ? { approved: [...jobIds], stale: [] }
      : { approved: [], stale: [...jobIds] };
  }
  const byId = new Map(data.results.map((row) => [row.job_id, row.outcome]));
  const approved = [];
  const stale = [];
  for (const id of jobIds) {
    const outcome = byId.get(id);
    if (outcome === "exported" || outcome === "already_exported") approved.push(id);
    else stale.push(id);
  }
  return { approved, stale };
}
