import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import OvertimeOtAsk from "@/components/OvertimeOtAsk";
import OvertimeProofHowTo from "@/components/OvertimeProofHowTo";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The overtime authorization the day needs (> 8 h): what the screenshot of the overtime request form must show, an example,
// and the picker. « Réessayer » reuses the picture kept in memory after a failure.
// The form of 27 November 2026 has two answers (« Durée réelle du temps supplémentaire chez le client », « Durée du retour »), on
// two screens, and no OT question any more: the step first asks « Temps supplémentaire pour quel OT ? » (one box), then the two
// captures, both sent together with the job (`onFiles(first, second, declaredOt)`).
export default function OvertimeEvidenceStep({ t, onFiles, validationError, error, canRetry, onRetry, busy, onSkip, progress, explain }) {
  const [files, setFiles] = useState([null, null]);
  // The OT the overtime is for, typed before the proof page (migration 0166); null until confirmed.
  const [declaredOt, setDeclaredOt] = useState(null);
  const inputs = [useRef(null), useRef(null)];
  const pick = (index) => (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (file) setFiles((current) => current.map((value, i) => (i === index ? file : value)));
  };
  const slots = [
    { label: t("form.evidence.pickClient"), title: t("form.evidence.slotClient") },
    { label: t("form.evidence.pickReturn"), title: t("form.evidence.slotReturn") },
  ];
  if (declaredOt === null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("form.evidence.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {progress && <p className="font-semibold" role="status">{t("form.evidence.progress", { n: progress.n, total: progress.total })}</p>}
          <OvertimeOtAsk sheetOt={explain?.ot} onConfirm={setDeclaredOt} />
        </div>
        {onSkip && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={onSkip}>{t("form.evidence.notYet")}</Button>
          </DialogFooter>
        )}
      </>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("form.evidence.title")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {progress && <p className="font-semibold" role="status">{t("form.evidence.progress", { n: progress.n, total: progress.total })}</p>}
        <p className="flex flex-wrap items-center gap-2 text-info">
          <span>{t("form.evidence.perJob", { ot: declaredOt })}</span>
          <button type="button" className="text-xs underline underline-offset-2" disabled={busy} onClick={() => setDeclaredOt(null)}>{t("form.evidence.askOtChange")}</button>
        </p>
        <OvertimeProofHowTo />
        {validationError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{validationError}</div>}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</div>}
        <div className="space-y-2">
          {slots.map((slot, index) => (
            <div key={slot.title} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{slot.title}</div>
                <div className={files[index] ? "truncate text-xs text-success" : "text-xs text-muted-foreground"}>
                  {files[index] ? `✓ ${t("form.evidence.chosen")}` : t("form.evidence.notChosen")}
                </div>
              </div>
              <Button type="button" size="sm" variant={files[index] ? "outline" : "default"} disabled={busy} onClick={() => inputs[index].current?.click()}>
                {files[index] ? t("form.evidence.change") : slot.label}
              </Button>
              <input ref={inputs[index]} type="file" accept="image/*" className="hidden" aria-label={slot.title} onChange={pick(index)} />
            </div>
          ))}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        {onSkip && (
          <Button type="button" variant="outline" disabled={busy} onClick={onSkip}>
            {t("form.evidence.notYet")}
          </Button>
        )}
        {canRetry && !busy && (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("form.evidence.retry")}
          </Button>
        )}
        <Button type="button" disabled={busy || !files[0] || !files[1]} onClick={() => onFiles(files[0], files[1], declaredOt)}>
          {busy ? t("form.evidence.processing") : t("form.evidence.sendBoth")}
        </Button>
      </DialogFooter>
    </>
  );
}
