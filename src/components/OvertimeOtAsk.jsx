import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleanDeclaredOt, declaredOtDiffers } from "@/lib/declared-ot";
import { useT } from "@/lib/use-t";

// « Temps supplémentaire pour quel OT ? » — asked BEFORE the proof page (the overtime form no longer has an OT question). One box;
// « Continuer » is enabled once it holds 3 to 8 digits. `sheetOt` (the OT of the sheet) only serves a warning when the two differ.
export default function OvertimeOtAsk({ initial = "", sheetOt = "", onConfirm, onCancel, busy = false }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const clean = cleanDeclaredOt(value);
  const differs = declaredOtDiffers(value, sheetOt);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => { event.preventDefault(); if (clean && !busy) onConfirm(clean); }}
    >
      <label className="block space-y-1 text-sm font-semibold">
        <span>{t("form.evidence.askOt")}</span>
        <Input
          value={value} inputMode="numeric" autoComplete="off" autoFocus maxLength={14} placeholder={t("form.evidence.askOtPlaceholder")}
          onChange={(e) => setValue(e.target.value)} aria-label={t("form.evidence.askOt")}
        />
      </label>
      {value.trim() !== "" && !clean && <p className="text-sm text-destructive" role="alert">{t("form.evidence.askOtInvalid")}</p>}
      {differs && <p className="text-sm text-warning" role="status">{t("form.evidence.askOtDiffers", { ot: sheetOt })}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={!clean || busy}>{t("form.evidence.askOtContinue")}</Button>
      </div>
    </form>
  );
}
