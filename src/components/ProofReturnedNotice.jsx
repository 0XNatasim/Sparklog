import React from "react";
import dayjs from "dayjs";
import OvertimeProofHowTo from "@/components/OvertimeProofHowTo";
import { useT } from "@/lib/use-t";

// The body of a « proof sent back » message (manager_broadcasts.kind = proof_returned, migration 0162): the OT and the day it
// is about, why, how to fix it, and the two example captures. The text of the message itself (body) stays the fallback for the
// push and for an app not yet updated; this block is built from meta so it follows the employee's language.
export const PROOF_RETURNED = "proof_returned";

export default function ProofReturnedNotice({ broadcast }) {
  const t = useT();
  const meta = broadcast?.meta || {};
  const reason = meta.reason ? t(`proofReturned.reason.${meta.reason}`) : "";
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold text-destructive">
        {t("proofReturned.line", { ot: meta.ot || "—", date: meta.job_date ? dayjs(meta.job_date).format("DD MMM YYYY") : "—" })}
      </p>
      {reason && <p>{t("proofReturned.why", { reason })}</p>}
      <p>{t("proofReturned.how")}</p>
      <OvertimeProofHowTo />
    </div>
  );
}
