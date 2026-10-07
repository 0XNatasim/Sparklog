import { buildJobSaveRpcArgs } from "./job-submission";
import { withTimeout } from "./utils";

// Submits one already-saved job through the atomic save_own_job RPC (shared by History and
// the end-of-day dialog of the work form).
export async function submitSavedJob(client, job) {
  const { error } = await withTimeout(
    client.rpc("save_own_job", buildJobSaveRpcArgs({
      editId: job.id,
      submit: true,
      jobDate: job.job_date,
      ot: job.ot,
      depart: job.depart,
      arrivee: job.arrivee,
      fin: job.fin,
      kmTotal: job.km_total,
      kmAller: job.km_aller,
      returnMinutes: job.return_time_minutes,
      kmRetour: job.km_retour,
      overtimeEvidenceCaptured: job.overtime_evidence_captured,
      parkingReceiptCaptured: job.parking_receipt_captured,
    })).single(),
    12000
  );
  if (error) throw error;
}
