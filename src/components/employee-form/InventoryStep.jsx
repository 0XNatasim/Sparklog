import React, { useState } from "react";
import { Camera, CircleCheck, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPLEMENT_SLOT, DEFECTIVE_SLOT, INVENTORY_SLOTS, defectiveCaptured, inventoryCaptured, inventoryReadingBlock, inventoryStepComplete } from "@/lib/inventory-screenshots";

// End-of-shift inventory step: the list screenshots (several at once), the reading of the lines and
// the « Produits défectueux » question with its picture. `inventory` comes from useInventoryStep.
export default function InventoryStep({ t, inventory, onContinue }) {
  const { rows, busySlot, reading, defectiveAnswer, setDefectiveAnswer, complementTried, notice, error, inputRef, multiInputRef, pickSlot, pickFiles, pickComplement, handleFile, handleFiles } = inventory;
  const [showExamples, setShowExamples] = useState(false);
  const busy = Boolean(busySlot);
  const captured = inventoryCaptured(rows);
  // Lines the reading could not read hold « Continuer » until a complément screenshot is sent (0117).
  const block = captured ? inventoryReadingBlock(reading, rows, { complementTried }) : null;
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
        {captured && (block === "retake" || block === "override") && (
          <RetakeNote reading={reading} t={t} busy={busy} uploading={busySlot === COMPLEMENT_SLOT} again={block === "override"} onRetake={pickComplement} />
        )}
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
        {block === "wait" && <span className="text-xs text-muted-foreground" role="status">{t("form.inventory.waitReading")}</span>}
        <Button
          type="button"
          variant={block === "override" ? "outline" : "default"}
          disabled={busy || !inventoryStepComplete(rows, defectiveAnswer) || block === "wait" || block === "retake"}
          onClick={() => { inventory.recordContinue?.(block); onContinue(); }}
        >
          {block === "override" ? t("form.inventory.continueAnyway") : t("form.inventory.continue")}
        </Button>
      </DialogFooter>
    </>
  );
}

// Lines the reading could not read (quantity cut off) or did not find: named, with the button for one
// more screenshot showing them. `again`: a complément was already sent and the lines are still not read.
function RetakeNote({ reading, t, busy, uploading, again, onRetake }) {
  const unreadable = reading?.unreadable || [];
  const probable = reading?.probable || [];
  const nothingRead = reading?.state === "photos";
  return (
    <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-warning" role="alert">
      <p className="font-medium">{t(again ? "form.inventory.retakeAgain" : nothingRead ? "form.inventory.nothingRead" : "form.inventory.retakeTitle")}</p>
      {unreadable.length > 0 && (
        <div>
          <p>{t("form.inventory.unreadableLines")}</p>
          <ul className="ml-4 list-disc">
            {unreadable.map((item) => <li key={item.code}><span className="font-semibold">{item.name}</span> <span className="text-xs opacity-80">{item.code}</span></li>)}
          </ul>
        </div>
      )}
      {reading?.missing > 0 && (
        <div>
          <p>{t("form.inventory.missingLines", { count: reading.missing })}</p>
          {probable.length > 0 && (
            <>
              <p className="text-xs">{t("form.inventory.probableLines")}</p>
              <ul className="ml-4 list-disc text-xs">
                {probable.map((item) => <li key={item.code}>{item.name} <span className="opacity-80">{item.code}</span></li>)}
              </ul>
            </>
          )}
        </div>
      )}
      <p className="text-xs">{t("form.inventory.retakeHint")}</p>
      <Button type="button" className="w-full" variant={again ? "outline" : "default"} disabled={busy} onClick={onRetake}>
        <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
        {uploading ? t("form.inventory.uploading") : t(nothingRead ? "form.inventory.retakeListButton" : "form.inventory.retakeButton")}
      </Button>
    </div>
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
