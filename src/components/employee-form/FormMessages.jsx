import React from "react";
import { Button } from "@/components/ui/button";
import { AUTO_RESEND_DELAYS_S } from "@/lib/employee-form-helpers";

// Messages above the time entry: error (with a retry when an existing job did not load), automatic
// resend, job entered by management, information (with « discard » for a restored draft), overlap
// warning and closed day (with the way back to today's job card).
export default function FormMessages({ t, err, canRetryLoad, retryDisabled, onRetryLoad, pendingResend, managerEntryBy, info, draftRestored, onDiscardDraft, warning, entryBlockedReason, canReturnToToday, returnDisabled, onReturnToToday }) {
  return (
    <>
      {err && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{err}</span>
          {canRetryLoad && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={retryDisabled} onClick={onRetryLoad}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}
      {pendingResend && (
        <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-info" role="status">
          {t("form.autoResend.pending", { attempt: pendingResend.attempt + 1, max: AUTO_RESEND_DELAYS_S.length })}
        </div>
      )}
      {managerEntryBy && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning" role="status">
          {t("form.managerEntry.banner", { name: managerEntryBy })}
        </div>
      )}
      {info && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          <span>{t(info)}</span>
          {draftRestored && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onDiscardDraft}>
              {t("form.draft.discard")}
            </Button>
          )}
        </div>
      )}
      {warning && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning" role="alert">
          {warning}
        </div>
      )}
      {entryBlockedReason && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
          <span>{entryBlockedReason}</span>
          {canReturnToToday && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={returnDisabled} onClick={onReturnToToday}>
              {t("form.deadline.backToJobCard")}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
