// « Modifier les minutes » (migration 0152): a very special owner-only switch. While it is on, the owner can move the Départ / Fin
// of a work sheet (saved / updated / submitted, never approved), delete it, or add its overtime proof (0155) from Avancé › Feuille de temps d'urgence, and every management
// page shows a red banner. Every change is audited (before / after / reason).
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";
import { prepareEvidenceImage, readPickedFile } from "@/lib/evidence-file";
import { uploadOvertimeEvidence } from "@/lib/overtime-evidence-check";

export const MINUTE_EDIT_EVENT = "sparklog:minute-edit";
export const EDITABLE_STATUSES = ["saved", "updated", "submitted"];
export const MINUTE_EDIT_REASON_MIN = 3;
export const MINUTE_EDIT_REASON_MAX = 500;

const hhmm = (value) => String(value || "").slice(0, 5);

// Minutes between two HH:mm (a Fin before the Départ means the next day, like the database).
export function minutesBetweenTimes(depart, fin) {
  const a = hhmm(depart).split(":").map(Number);
  const b = hhmm(fin).split(":").map(Number);
  if (a.length < 2 || b.length < 2 || a.some(Number.isNaN) || b.some(Number.isNaN)) return null;
  let diff = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  if (diff <= 0) diff += 1440;
  return diff;
}

// Keys of what is wrong with a change; empty = ready. `row` = { depart, fin, reason }.
export function validateTimesAdjust({ depart, fin, reason }) {
  const problems = [];
  const minutes = minutesBetweenTimes(depart, fin);
  if (!/^\d{2}:\d{2}$/.test(hhmm(depart))) problems.push("depart");
  if (!/^\d{2}:\d{2}$/.test(hhmm(fin))) problems.push("fin");
  if (!problems.length && (minutes === null || minutes <= 0 || minutes > 960)) problems.push("interval");
  const clean = String(reason || "").trim();
  if (clean.length < MINUTE_EDIT_REASON_MIN || clean.length > MINUTE_EDIT_REASON_MAX) problems.push("reason");
  return problems;
}

// Has the owner changed anything? (Départ or Fin different from what is saved)
export const timesChanged = (job, depart, fin) => hhmm(job?.depart) !== hhmm(depart) || hhmm(job?.fin) !== hhmm(fin);

export async function fetchMinuteEditEnabled(client = supabase) {
  const { data } = await withTimeout(client.from("overtime_settings").select("*").eq("id", true).maybeSingle(), 12000).catch(() => ({ data: null }));
  return data?.minute_edit_enabled === true; // a missing column (migration not applied yet) = off
}

export async function setMinuteEditEnabled(client, enabled) {
  const { error } = await withTimeout(client.rpc("set_minute_edit_enabled", { p_enabled: Boolean(enabled) }), 12000);
  if (error) throw error;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MINUTE_EDIT_EVENT));
}

export async function adjustJobTimes(client, { jobId, depart, fin, reason }) {
  const { data, error } = await withTimeout(client.rpc("adjust_job_times_for_employee", {
    p_job_id: jobId, p_depart: hhmm(depart), p_fin: hhmm(fin), p_reason: String(reason || "").trim(),
  }).single(), 15000);
  if (error) throw error;
  return data;
}

// Deletes the sheet (same switch, same reasons as a change; the sheet is copied into the Journal first).
export async function deleteJobAsOwner(client, { jobId, reason }) {
  const { error } = await withTimeout(client.rpc("delete_job_for_employee", { p_job_id: jobId, p_reason: String(reason || "").trim() }), 15000);
  if (error) throw error;
}

export async function fetchEditableJobs(client, userId, jobDate) {
  const { data, error } = await withTimeout(client.from("jobs").select("id, user_id, ot, depart, arrivee, fin, status, return_time_minutes, job_date")
    .eq("user_id", userId).eq("job_date", jobDate).in("status", EDITABLE_STATUSES).order("depart"), 12000);
  if (error) throw error;
  return data || [];
}

// The overtime proofs already recorded for the day (managers read the table): [{ id, job_id, ocr_status, not_needed_at }].
export async function fetchDayProofs(client, userId, jobDate) {
  const { data, error } = await withTimeout(client.from("overtime_evidence").select("id, job_id, ocr_status, not_needed_at, created_at")
    .eq("user_id", userId).eq("job_date", jobDate).order("created_at"), 12000);
  if (error) throw error;
  return data || [];
}

// Adds the overtime proof of a sheet for the employee (migration 0155, same switch and reason as a change). The picture goes
// into the EMPLOYEE's folder (the owner may write there since 0155), then the function records it; a refused record removes
// the picture again. The reading of the form is queued by the OCR queue (the owner's phone does not trigger it).
export async function addProofAsOwner(client, { job, file, reason, dailyMinutes = 0 }) {
  const evidenceId = crypto.randomUUID();
  const path = `${job.user_id}/${job.job_date}/${evidenceId}.jpg`;
  const source = file instanceof File ? await readPickedFile(file) : file;
  const image = await prepareEvidenceImage(source);
  await uploadOvertimeEvidence(client, path, image);
  const { error } = await withTimeout(client.rpc("add_overtime_proof_for_employee", {
    p_job_id: job.id, p_evidence_id: evidenceId, p_storage_path: path, p_daily_minutes: Math.max(0, Math.round(dailyMinutes)), p_reason: String(reason || "").trim(),
  }), 15000);
  if (error) {
    await client.storage.from("overtime-evidence").remove([path]).catch(() => undefined);
    throw error;
  }
  return evidenceId;
}

// Is the switch on? Read on mount, when the owner changes it (event) and when the window comes back to the front.
export function useMinuteEditEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetchMinuteEditEnabled().then((value) => { if (alive) setEnabled(value); });
    load();
    window.addEventListener(MINUTE_EDIT_EVENT, load);
    window.addEventListener("focus", load);
    return () => { alive = false; window.removeEventListener(MINUTE_EDIT_EVENT, load); window.removeEventListener("focus", load); };
  }, []);
  return enabled;
}
