import { DAILY_REGULAR_MINUTES, TEN_HOUR_DAY_MINUTES, dayFirstTripUnpaidMinutes, minutesBetween } from "./payroll-calculations";

// What the overtime request form (screenshot kept as the day's proof) must say, worked out from the day's jobs the way
// Sparklog already does when a day passes 8 h:
//   OT                = the OT of the day's LAST job;
//   chez le client    = paid minutes of the day, the return trip left out, beyond the regular day (8 h, or 10 h on « 4 jours de 10 h »)
//                       — time at the client, paid normally;
//   retour            = the billable return minutes entered at the end of the day (return without social benefits).
// The picture is read by the Edge function `process_overtime_evidence`; a difference is only an alert in
// « À vérifier avant d'approuver », it never blocks anything.
export const PROOF_CLIENT_TOLERANCE_MIN = 15; // the day is paid rounded to 15 minutes
export const PROOF_RETURN_TOLERANCE_MIN = 5; // return minutes are entered in steps of 5

const REVIEWABLE = new Set(["submitted", "approved"]);

// « OT-208637 » / « 208637 » → "208637"; a preset label (« FORMATION HQ ») has no number to compare.
export function otDigits(value) {
  const match = String(value ?? "").trim().match(/^(?:OT[\s\-–—_:]*)?(\d{3,8})$/i);
  return match ? match[1] : null;
}

export function expectedProof(dayJobs, { firstTripUnpaid = false, tenHourDay = false } = {}) {
  const jobs = (dayJobs || []).filter((job) => job?.depart && job?.fin).slice().sort((a, b) => String(a.depart).localeCompare(String(b.depart)));
  if (!jobs.length) return null;
  const last = jobs[jobs.length - 1];
  const returnMinutes = jobs.reduce((sum, job) => sum + (Number(job.return_time_minutes) || 0), 0);
  const worked = jobs.reduce((sum, job) => sum + minutesBetween(job.depart, job.fin), 0);
  const paid = worked - (firstTripUnpaid ? dayFirstTripUnpaidMinutes(jobs) : 0);
  const regular = tenHourDay ? TEN_HOUR_DAY_MINUTES : DAILY_REGULAR_MINUTES;
  return {
    ot: otDigits(last.ot),
    clientMinutes: Math.max(0, paid - returnMinutes - regular),
    returnMinutes,
  };
}

// `found` = { ot, clientMinutes, returnMinutes } read from the picture (null = not found). Only what was read is compared.
export function proofDifferences(found, expected) {
  if (!found || !expected) return [];
  const diffs = [];
  if (found.ot != null && expected.ot != null && String(found.ot).replace(/^0+/, "") !== String(expected.ot).replace(/^0+/, "")) {
    diffs.push({ field: "ot", found: found.ot, expected: expected.ot });
  }
  if (found.clientMinutes != null && Math.abs(found.clientMinutes - expected.clientMinutes) > PROOF_CLIENT_TOLERANCE_MIN) {
    diffs.push({ field: "client", found: found.clientMinutes, expected: expected.clientMinutes });
  }
  if (found.returnMinutes != null && Math.abs(found.returnMinutes - expected.returnMinutes) > PROOF_RETURN_TOLERANCE_MIN) {
    diffs.push({ field: "return", found: found.returnMinutes, expected: expected.returnMinutes });
  }
  return diffs;
}

// Anomalies for the manager's box. `evidenceRows`: overtime_evidence rows (job_id, ocr_status, proof_ot, proof_client_minutes,
// proof_return_minutes, proof_read_at); `jobs`: the submitted and approved jobs of the same days. Only submitted jobs are
// flagged, and only pictures the new reader has seen (proof_read_at): older SMS proofs are never compared.
export function proofAnomalies(evidenceRows, jobs, { firstTripUnpaidUsers = new Set(), tenHourUsers = new Set() } = {}) {
  const reviewable = (jobs || []).filter((job) => REVIEWABLE.has(job.status) && job.user_id && job.job_date);
  const byId = new Map(reviewable.map((job) => [job.id, job]));
  const anomalies = [];
  for (const row of evidenceRows || []) {
    if (!row?.proof_read_at) continue;
    const job = byId.get(row.job_id);
    if (!job || job.status !== "submitted") continue;
    const base = { userId: job.user_id, jobDate: job.job_date, jobIds: [job.id] };
    const found = { ot: row.proof_ot ?? null, clientMinutes: row.proof_client_minutes ?? null, returnMinutes: row.proof_return_minutes ?? null };
    if (found.ot === null && found.clientMinutes === null && found.returnMinutes === null) {
      anomalies.push({ key: `proof_unread:${job.id}`, type: "proof_unread", ...base });
      continue;
    }
    const dayJobs = reviewable.filter((other) => other.user_id === job.user_id && String(other.job_date) === String(job.job_date));
    const diffs = proofDifferences(found, expectedProof(dayJobs, {
      firstTripUnpaid: firstTripUnpaidUsers.has(job.user_id),
      tenHourDay: tenHourUsers.has(job.user_id),
    }));
    if (diffs.length) anomalies.push({ key: `proof_mismatch:${job.id}`, type: "proof_mismatch", ...base, diffs });
  }
  return anomalies;
}

// « OT 208637 (attendu 209210) ; chez le client 60 min (attendu 40) ». `t` is the i18n function.
export function proofDetailsText(anomaly, t) {
  return (anomaly?.diffs || []).map((diff) => t(`manager.anomalies.proofField.${diff.field}`, { found: diff.found, expected: diff.expected })).join(" ; ");
}
