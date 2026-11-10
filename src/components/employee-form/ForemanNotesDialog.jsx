import React, { useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { MAX_AUDITED_NAME, MAX_REPORT, cleanReport, submitForemanReport } from "@/lib/foreman-reports";

const textareaClass = "min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// « Notes du contremaître »: a short report on an audit of the other employees (0134). The managers read it in
// Notes › Contremaître. The form lives inside the dialog content, so it starts empty each time the dialog opens.
// One submission key per report, kept until it is sent: a double tap or a retry after a lost response is one report.
export default function ForemanNotesDialog({ t, open, onOpenChange, userId, reportDate }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <ForemanNotesForm t={t} userId={userId} reportDate={reportDate} busy={busy} setBusy={setBusy} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ForemanNotesForm({ t, userId, reportDate, busy, setBusy, onClose }) {
  const [auditedName, setAuditedName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const busyRef = useRef(false);

  const clean = cleanReport({ auditedName, body });

  async function send() {
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await submitForemanReport(supabase, { userId, submissionKey, reportDate, auditedName, body });
      setSent(true);
    } catch (e) {
      setError(friendlyErrorMessage(e, t, "foremanNotes.errors.sendFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />{t("foremanNotes.title")}</DialogTitle>
        <DialogDescription>{t("foremanNotes.hint")}</DialogDescription>
      </DialogHeader>
      {sent ? (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm font-medium text-success" role="status">{t("foremanNotes.sent")}</p>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>{t("foremanNotes.audited")}</span>
            <Input value={auditedName} maxLength={MAX_AUDITED_NAME} disabled={busy} placeholder={t("foremanNotes.auditedPlaceholder")} onChange={(e) => setAuditedName(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>{t("foremanNotes.report")}</span>
            <textarea className={textareaClass} value={body} maxLength={MAX_REPORT} disabled={busy} onChange={(e) => setBody(e.target.value)} />
          </label>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
      )}
      <DialogFooter className="gap-2 sm:gap-0">
        {sent ? (
          <Button type="button" onClick={onClose}>{t("common.ok")}</Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="button" disabled={busy || !clean} onClick={send}>{busy ? t("foremanNotes.sending") : t("foremanNotes.send")}</Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
