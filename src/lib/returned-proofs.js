// Overtime proofs a manager sent back (message kind proof_returned, migration 0162) whose job is still waiting for new captures:
// the employee keeps seeing a banner until the job is submitted again. Read: the employee's own messages (bell) and own jobs.
import { queryBroadcasts } from "@/lib/use-employee-broadcasts";

const OPEN_STATUSES = ["saved", "updated"];

// [{ jobId, ot, jobDate }] oldest day first. Never throws: a failed read is « nothing to show ».
export async function fetchReturnedProofJobs(client, userId) {
  try {
    const messages = (await queryBroadcasts(userId))
      .map((row) => row.manager_broadcasts)
      .filter((message) => message?.kind === "proof_returned" && message.meta?.job_id);
    const ids = [...new Set(messages.map((message) => message.meta.job_id))];
    if (ids.length === 0) return [];
    const { data, error } = await client.from("jobs").select("id, ot, job_date, status").in("id", ids).in("status", OPEN_STATUSES);
    if (error) return [];
    return (data || []).map((job) => ({ jobId: job.id, ot: job.ot, jobDate: job.job_date })).sort((a, b) => String(a.jobDate).localeCompare(String(b.jobDate)));
  } catch {
    return [];
  }
}
