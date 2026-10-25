import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RETURN_TIME_OPTIONS } from "@/lib/job-contract";
import { AUTO_RESEND_DELAYS_S, formatReturnMinutes, normalizeNumber } from "@/lib/employee-form-helpers";
import OvertimeEvidenceStep from "./OvertimeEvidenceStep";
import InventoryStep from "./InventoryStep";

// The save flow of the time entry, one step at a time: last work order of the day? → return to the
// shop (time, km) → overtime proof (day > 8 h) → inventory → submit the day. `step` is the open step
// ("closed" hides the dialog); every action is EmployeeForm's.
export default function EndOfShiftDialog({ t, step, onStep, busy, onClose, saveError, pendingResend, returnFlow, evidence, inventory, day }) {
  const { saving, checking, answerLastJob, saveWithReturn, minutes, setMinutes, km, setKm, kmTotal } = returnFlow;
  const total = normalizeNumber(kmTotal) || 0;
  const returnKm = normalizeNumber(km);
  return (
    <Dialog open={step !== "closed"} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        {saveError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {saveError}
            {pendingResend && <p className="mt-1 text-xs text-info">{t("form.autoResend.pending", { attempt: pendingResend.attempt + 1, max: AUTO_RESEND_DELAYS_S.length })}</p>}
          </div>
        )}
        {step === "last" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("form.last.title")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("form.last.description")}</p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving || checking} onClick={() => answerLastJob(false)}>
                {checking ? t("common.pleaseWait") : t("common.no")}
              </Button>
              <Button type="button" disabled={saving || checking} onClick={() => answerLastJob(true)}>
                {t("common.yes")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "ask" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("form.return.askTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("form.return.askDescription")}</p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving || checking} onClick={() => saveWithReturn(0, 0, "draft")}>
                {checking ? t("common.pleaseWait") : t("common.no")}
              </Button>
              <Button type="button" disabled={saving || checking} onClick={() => onStep("time")}>
                {t("common.yes")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "time" && (
          <>
            <DialogHeader><DialogTitle>{t("form.return.timeTitle")}</DialogTitle></DialogHeader>
            <div className="grid max-h-[55vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
              {RETURN_TIME_OPTIONS.map((option) => (
                <Button key={option} type="button" variant={minutes === option ? "default" : "outline"} className="px-2" onClick={() => {
                  setMinutes(option);
                  onStep("km");
                }}>
                  {formatReturnMinutes(option)}
                </Button>
              ))}
            </div>
          </>
        )}

        {step === "km" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("form.return.kmTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="return-km">{t("form.return.kmLabel")}</Label>
              <Input
                id="return-km"
                type="text"
                inputMode="decimal"
                autoFocus
                value={km}
                onChange={(event) => setKm(event.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">{t("form.return.selectedTime", { time: formatReturnMinutes(minutes || 0) })}</p>
              {returnKm !== null && returnKm >= 0 && returnKm <= total && (
                <p className="text-xs font-medium text-muted-foreground">
                  {t("form.return.kmBreakdown", { client: Math.max(0, total - returnKm), returnKm, total })}
                </p>
              )}
              {returnKm !== null && returnKm > total && (
                <p className="text-xs font-medium text-destructive">
                  {t("form.return.kmExceedsTotal")} ({t("form.return.kmBreakdown", { client: 0, returnKm, total })})
                </p>
              )}
              {returnKm !== null && returnKm < 0 && (
                <p className="text-xs font-medium text-destructive">{t("form.return.kmNegative")}</p>
              )}
              {saveError && <p className="text-xs font-medium text-destructive">{saveError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" disabled={saving || checking || returnKm === null || returnKm < 0 || returnKm > total} onClick={() => saveWithReturn(minutes, returnKm)}>
                {saving || checking ? t("common.saving") : t("form.buttons.save")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "evidence" && <OvertimeEvidenceStep t={t} {...evidence} />}

        {step === "inventory" && <InventoryStep t={t} inventory={inventory} onContinue={() => onStep("dayDone")} />}

        {step === "dayDone" && (
          <>
            <DialogHeader><DialogTitle>{t("form.day.readyTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t(day.withInventory ? "form.day.readyDescription" : "form.day.readyDescriptionPlain")}</p>
            {day.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{day.error}</div>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={day.busy} onClick={day.onReview}>
                {t("form.day.review")}
              </Button>
              <Button type="button" variant="success" disabled={day.busy} onClick={day.onSubmit}>
                {day.busy ? t("common.submitting") : t("form.day.submit")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "daySubmitted" && (
          <>
            <DialogHeader><DialogTitle>{t("form.day.submittedTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("form.day.submittedDescription")}</p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>{t("common.ok")}</Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader><DialogTitle>{t("form.return.savedTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("form.return.savedDescription")}</p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>{t("common.ok")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
