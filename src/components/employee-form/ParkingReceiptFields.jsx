import React from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeNumber } from "@/lib/employee-form-helpers";

// Parking of the job: amount and parcomètre pictures (several at once, 0095). Pictures already saved can
// be added to or replaced while the claim is pending; a reviewed claim is final (RLS: pending only).
// `inputRef` / `modeRef` belong to EmployeeForm, which also opens the picker when a receipt is missing.
export default function ParkingReceiptFields({ t, disabled, amount, onAmount, files, filesMode, saved, hasReceipt, inputRef, modeRef, onPick, onCancelPicked }) {
  const parkingLocked = hasReceipt && saved.status !== "pending";
  const pick = (mode) => { modeRef.current = mode; inputRef.current?.click(); };
  const missingPicture = normalizeNumber(amount) > 0 && files.length === 0 && !hasReceipt;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">
        {files.length > 0
          ? t(filesMode === "add" && hasReceipt ? "form.parking.pickedAdded" : hasReceipt ? "form.parking.pickedReplacing" : "form.parking.picked", { count: files.length, saved: saved.count })
          : hasReceipt
            ? t("form.parking.savedCount", { count: Math.max(1, saved.count) })
            : t("form.parking.description")}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="parking-amount">{t("form.parking.amount")}</Label>
          <Input id="parking-amount" type="number" inputMode="decimal" min="0.01" max="20" step="0.01" value={amount} disabled={disabled || parkingLocked || (hasReceipt && files.length === 0)} onChange={(event) => onAmount(event.target.value)} placeholder="0.00" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hasReceipt && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`w-fit ${missingPicture ? "border-destructive text-destructive ring-1 ring-destructive/40 hover:border-destructive hover:text-destructive" : ""}`}
              disabled={disabled}
              onClick={() => pick("replace")}
            >
              {t(files.length > 0 ? "form.parking.chooseAgain" : "form.parking.chooseReceipts")}
            </Button>
          )}
          {hasReceipt && !parkingLocked && (
            <>
              <Button type="button" size="sm" variant="outline" className="w-fit" disabled={disabled} onClick={() => pick("add")}>
                {t("form.parking.addReceipts")}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="w-fit" disabled={disabled} onClick={() => pick("replace")}>
                {t("form.parking.replaceReceipts")}
              </Button>
            </>
          )}
          {hasReceipt && files.length > 0 && (
            <Button type="button" size="sm" variant="ghost" className="w-fit" disabled={disabled} onClick={onCancelPicked}>
              {t("common.cancel")}
            </Button>
          )}
          {hasReceipt && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-success" title={t("form.parking.receiptSaved")}>
              <CircleCheck className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">{t("form.parking.receiptSaved")}</span>
            </span>
          )}
        </div>
      </div>
      {files.length > 0 && <div className="text-xs text-muted-foreground">{t("form.parking.amountHint")}</div>}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => onPick(event, modeRef.current)} />
    </div>
  );
}
