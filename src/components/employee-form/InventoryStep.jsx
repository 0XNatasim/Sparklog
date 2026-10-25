import React, { useState } from "react";
import { CircleCheck, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFECTIVE_SLOT, INVENTORY_SLOTS, defectiveCaptured, inventoryCaptured, inventoryStepComplete } from "@/lib/inventory-screenshots";

// End-of-shift inventory step: the list screenshots (several at once), the reading of the lines and
// the « Produits défectueux » question with its picture. `inventory` comes from useInventoryStep.
export default function InventoryStep({ t, inventory, onContinue }) {
  const { rows, busySlot, reading, defectiveAnswer, setDefectiveAnswer, notice, error, inputRef, multiInputRef, pickSlot, pickFiles, handleFile, handleFiles } = inventory;
  const [showExamples, setShowExamples] = useState(false);
  const busy = Boolean(busySlot);
  const captured = inventoryCaptured(rows);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("form.inventory.title")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("form.inventory.description")}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={showExamples}
          onClick={() => setShowExamples((visible) => !visible)}
        >
          {showExamples ? t("form.inventory.hideExample") : t("form.inventory.showExample")}
        </Button>
        {showExamples && (
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-background p-2">
            {INVENTORY_SLOTS.map((slot) => (
              <img key={slot} src={`/inventory-examples/${slot}.webp`} alt={t("form.inventory.exampleAlt", { n: slot })} className="max-h-72 w-full rounded object-contain" />
            ))}
          </div>
        )}
        <Button
          type="button"
          className="w-full"
          variant={captured ? "outline" : "default"}
          disabled={busy}
          onClick={pickFiles}
        >
          <Images className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("form.inventory.pickMany")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("form.inventory.pickManyHint")}</p>
        <ul className="space-y-2">
          {INVENTORY_SLOTS.map((slot) => {
            const done = rows.some((row) => row.slot === slot);
            return (
              <li key={slot} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="flex items-center gap-2 font-medium">
                  {done && <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />}
                  {t("form.inventory.slot", { n: slot })}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pickSlot(slot)}>
                  {busySlot === slot ? t("form.inventory.uploading") : done ? t("form.inventory.replace") : t("form.inventory.capture")}
                </Button>
              </li>
            );
          })}
        </ul>
        {captured && reading && <InventoryReadingNote reading={reading} t={t} />}
        {captured && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">{t("form.inventory.defectiveQuestion")}</p>
            <p className="text-xs text-muted-foreground">{t("form.inventory.defectiveHint")}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("form.inventory.defectiveQuestion")}>
              <Button type="button" variant={defectiveAnswer === "yes" ? "default" : "outline"} aria-pressed={defectiveAnswer === "yes"} disabled={busy} onClick={() => setDefectiveAnswer("yes")}>
                {t("form.inventory.defectiveYes")}
              </Button>
              <Button type="button" variant={defectiveAnswer === "no" ? "default" : "outline"} aria-pressed={defectiveAnswer === "no"} disabled={busy} onClick={() => setDefectiveAnswer("no")}>
                {t("form.inventory.defectiveNo")}
              </Button>
            </div>
            {defectiveAnswer === "yes" && (
              <>
                <p className="text-xs text-muted-foreground">{t("form.inventory.defectivePhotoHint")}</p>
                <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="flex items-center gap-2 font-medium">
                    {defectiveCaptured(rows) && <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />}
                    {t("form.inventory.defectiveSlot")}
                  </span>
                  <Button type="button" size="sm" variant={defectiveCaptured(rows) ? "outline" : "default"} disabled={busy} onClick={() => pickSlot(DEFECTIVE_SLOT)}>
                    {busySlot === DEFECTIVE_SLOT ? t("form.inventory.uploading") : defectiveCaptured(rows) ? t("form.inventory.replace") : t("form.inventory.capture")}
                  </Button>
                </div>
                {defectiveCaptured(rows) && reading?.defective && (
                  <DefectiveReadingNote reading={reading.defective} t={t} />
                )}
              </>
            )}
          </div>
        )}
        {notice && <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-warning" role="status">{notice}</div>}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive" role="alert">{error}</div>}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <input ref={multiInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>
      <DialogFooter>
        <Button type="button" disabled={busy || !inventoryStepComplete(rows, defectiveAnswer)} onClick={onContinue}>
          {t("form.inventory.continue")}
        </Button>
      </DialogFooter>
    </>
  );
}

// What was read under « Produits défectueux » on the slot 4 picture (indicative, like the list).
function DefectiveReadingNote({ reading, t }) {
  if (reading.state === "reading") {
    return <p className="text-xs text-muted-foreground" role="status">{t("form.inventory.readingNow")}</p>;
  }
  if (reading.count > 0) {
    const complete = reading.state === "ok";
    return (
      <p className={complete ? "text-xs text-success" : "text-xs text-warning"} role="status">
        {complete
          ? t("form.inventory.defectiveReadComplete", { count: reading.count, expected: reading.expected })
          : t("form.inventory.defectiveRead", { count: reading.count })}
      </p>
    );
  }
  return <p className="text-xs text-warning" role="status">{t("form.inventory.defectiveUnreadable")}</p>;
}

// Result of the automatic reading of the inventory screenshots, shown to the employee: the list
// is complete when the lines read match the app's own "N de N" total. Informative only.
function InventoryReadingNote({ reading, t }) {
  if (reading.state === "reading") {
    return <p className="text-muted-foreground" role="status">{t("form.inventory.readingNow")}</p>;
  }
  if (reading.state === "ok") {
    return (
      <p className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-success" role="status">
        <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
        {t("form.inventory.readingComplete", { count: reading.count, expected: reading.expected })}
      </p>
    );
  }
  if (reading.expected && reading.count < reading.expected) {
    return (
      <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-warning" role="status">
        {t("form.inventory.readingShort", { count: reading.count, expected: reading.expected })}
      </p>
    );
  }
  return <p className="text-muted-foreground" role="status">{t("form.inventory.readingUnverified")}</p>;
}
