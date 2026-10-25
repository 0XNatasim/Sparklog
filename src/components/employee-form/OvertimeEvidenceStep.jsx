import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The overtime authorization the day needs (> 8 h): what the SMS screenshot must show, an example,
// and the picker. « Réessayer » reuses the picture kept in memory after a failure.
export default function OvertimeEvidenceStep({ t, inputRef, onFile, validationError, error, canRetry, onRetry, busy }) {
  const [showExample, setShowExample] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("form.evidence.title")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {t("form.evidence.description")}
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="font-semibold">{t("form.evidence.requiredContentTitle")}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t("form.evidence.requiredApproval")}</li>
            <li>{t("form.evidence.requiredDuration")}</li>
            <li>{t("form.evidence.requiredCrop")}</li>
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            aria-expanded={showExample}
            aria-controls="overtime-evidence-example"
            onClick={() => setShowExample((visible) => !visible)}
          >
            {showExample ? t("form.evidence.hideExample") : t("form.evidence.showExample")}
          </Button>
          {showExample && (
            <div id="overtime-evidence-example" className="mt-3 rounded-md border bg-background p-2">
              <img
                src="/overtime-evidence-example.webp"
                alt={t("form.evidence.exampleAlt")}
                className="max-h-96 w-full rounded object-contain"
              />
            </div>
          )}
        </div>
        {validationError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{validationError}</div>}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</div>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>
      <DialogFooter>
        {canRetry && !busy && (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("form.evidence.retry")}
          </Button>
        )}
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? t("form.evidence.processing") : t("form.evidence.choose")}
        </Button>
      </DialogFooter>
    </>
  );
}
