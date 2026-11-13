import React, { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_AUDITED_NAME, MAX_REPORT, cleanReport } from "@/lib/foreman-reports";

const textareaClass = "min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// « Note du contremaître »: an optional short note on an audit of the other employees, attached to this work sheet
// (0136). The dialog only keeps the text on the form (`onSave`); it is sent with the job when the job is saved, and the
// managers read it with the job in Notes › Contremaître. The form lives inside the dialog content, so it starts from the
// current note each time the dialog opens.
export default function ForemanNotesDialog({ t, open, onOpenChange, note, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ForemanNotesForm t={t} note={note} onSave={onSave} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ForemanNotesForm({ t, note, onSave, onClose }) {
  const [auditedName, setAuditedName] = useState(note?.auditedName || "");
  const [body, setBody] = useState(note?.body || "");
  const clean = cleanReport({ auditedName, body });
  // An emptied text removes the note that was not sent yet; a note already on the job is edited, not removed.
  const canSave = Boolean(clean);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />{t("foremanNotes.title")}</DialogTitle>
        <DialogDescription>{t("foremanNotes.hint")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("foremanNotes.audited")}</span>
          <Input value={auditedName} maxLength={MAX_AUDITED_NAME} placeholder={t("foremanNotes.auditedPlaceholder")} onChange={(e) => setAuditedName(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("foremanNotes.report")}</span>
          <textarea className={textareaClass} value={body} maxLength={MAX_REPORT} onChange={(e) => setBody(e.target.value)} />
        </label>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="button" disabled={!canSave} onClick={() => { onSave({ auditedName: clean.auditedName || "", body: clean.body }); onClose(); }}>{t("foremanNotes.attach")}</Button>
      </DialogFooter>
    </>
  );
}
