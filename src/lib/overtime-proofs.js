// The employee's own overtime proofs, per work order (migration 0144): read them, add / replace / remove the one of a job that
// is still editable. The table cannot be read by an employee, so every read and write goes through a function.
import { readPickedFile, prepareEvidenceImage } from "@/lib/evidence-file";
import { uploadOvertimeEvidence } from "@/lib/overtime-evidence-check";
import { withTimeout } from "@/lib/utils";

const BUCKET = "overtime-evidence";

// The proofs of one work date: [{ id, job_id, storage_path, created_at }], oldest first.
export async function fetchMyProofs(client, jobDate) {
  const { data, error } = await withTimeout(client.rpc("my_overtime_proofs", { p_date: jobDate }), 12000);
  if (error) throw error;
  return data || [];
}

// Signed links (valid 10 min) for the pictures: Map of storage_path -> url.
export async function signedProofUrls(client, paths) {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (!list.length) return new Map();
  const { data, error } = await withTimeout(client.storage.from(BUCKET).createSignedUrls(list, 600), 12000);
  if (error) throw error;
  return new Map((data || []).filter((row) => row?.path && row.signedUrl).map((row) => [row.path, row.signedUrl]));
}

// Adds the proof of a job, or replaces `oldProofId`. The picture is sent first, then recorded (job still editable, own
// folder, file really there: checked by the database); the reading of the form is then queued, best effort.
export async function saveOwnProof(client, { userId, job, oldProofId = null, file, dailyMinutes = 0 }) {
  const evidenceId = crypto.randomUUID();
  const path = `${userId}/${job.job_date}/${evidenceId}.jpg`;
  const source = file instanceof File ? await readPickedFile(file) : file;
  const image = await prepareEvidenceImage(source);
  await uploadOvertimeEvidence(client, path, image);
  const { error } = await withTimeout(client.rpc("save_own_overtime_proof", {
    p_job_id: job.id, p_old_evidence_id: oldProofId, p_evidence_id: evidenceId, p_storage_path: path, p_daily_minutes: Math.max(0, Math.round(dailyMinutes)),
  }), 15000);
  if (error) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  await withTimeout(client.functions.invoke("process_overtime_evidence", { body: { evidence_id: evidenceId } }), 12000).catch(() => undefined);
  return evidenceId;
}

export async function removeOwnProof(client, proofId) {
  const { error } = await withTimeout(client.rpc("remove_own_overtime_proof", { p_evidence_id: proofId }), 12000);
  if (error) throw error;
}
