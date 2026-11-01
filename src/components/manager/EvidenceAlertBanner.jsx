import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { EVIDENCE_ALERT_DAYS, useEvidenceAlert } from "@/lib/evidence-alert";
import { useT } from "@/lib/use-t";

// Red notice for the managers: proofs (overtime screenshots, parking receipts) not downloaded yet that are 21 days old
// or more — they are deleted at the end of the retention. `link`: show the way to Justificatifs (on À traiter).
export default function EvidenceAlertBanner({ link = false }) {
  const t = useT();
  const alert = useEvidenceAlert();
  if (alert.total <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <div className="font-semibold">{t("evidence.alert.title", { count: alert.total, days: EVIDENCE_ALERT_DAYS })}</div>
          <div className="text-xs">
            {t("evidence.alert.detail", { overtime: alert.overtime, parking: alert.parking, left: alert.daysLeft ?? 0 })}
          </div>
        </div>
      </div>
      {link && <Link to="/manager/todo?tab=receipts" className="font-semibold underline">{t("evidence.alert.open")}</Link>}
    </div>
  );
}
