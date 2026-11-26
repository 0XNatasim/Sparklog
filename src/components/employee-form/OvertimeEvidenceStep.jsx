import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { useOvertimeConfirmationForm } from "@/lib/overtime-form-link";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The overtime authorization the day needs (> 8 h): what the screenshot of the overtime request form must show, an example,
// and the picker. « Réessayer » reuses the picture kept in memory after a failure.
// The form of November 2026 has two answers (« Durée réelle du temps supplémentaire », « Durée du retour »), on two screens: the
// employee gives TWO captures here, both sent together with the job (`onFiles(first, second)`).
export default function OvertimeEvidenceStep({ t, onFiles, validationError, error, canRetry, onRetry, busy, onSkip, progress, explain }) {
  const [files, setFiles] = useState([null, null]);
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
  const form = useOvertimeConfirmationForm();
  const { language } = useLanguage();
  const formName = (language === "en" ? form?.nameEn || form?.nameFr : form?.nameFr || form?.nameEn) || t("form.evidence.formName");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("form.evidence.title")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {progress && <p className="font-semibold" role="status">{t("form.evidence.progress", { n: progress.n, total: progress.total })}</p>}
        {explain && (
          <p className="text-info">
            {form?.url ? (
              <a href={form.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                {formName}
              </a>
            ) : (
              <span className="font-semibold">{t("form.evidence.formName")}</span>
            )}
            {explain.perJob && <> — {t("form.evidence.perJob", { ot: explain.ot })}</>}
          </p>
        )}
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="font-semibold">{t("form.evidence.short1")}</p>
          <p className="mt-1 font-semibold text-destructive">{t("form.evidence.short2")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[1, 2].map((n) => (
              <figure key={n} className="space-y-1">
                <img src={`/overtime-example-${n}.webp`} alt={t(`form.evidence.exampleAlt${n}`)} className="w-full rounded border bg-background" />
                <figcaption className="text-xs font-semibold">{t(`form.evidence.caption${n}`)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
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
        <Button type="button" disabled={busy || !files[0] || !files[1]} onClick={() => onFiles(files[0], files[1])}>
          {busy ? t("form.evidence.processing") : t("form.evidence.sendBoth")}
        </Button>
      </DialogFooter>
    </>
  );
}
