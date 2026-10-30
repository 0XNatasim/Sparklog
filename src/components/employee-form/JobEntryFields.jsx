import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OtField from "@/components/OtField";
import { usePresetWorkOrders } from "@/lib/preset-work-orders";

const TIME_FIELDS = "grid gap-1 sm:gap-1.5";

// Date · OT · Départ (Début for the office) · Arrivée · Fin · km, then the total hours and the parking
// box. `onChange(field, value)` updates one field and marks the entry as changed.
export default function JobEntryFields({ t, values, onChange, disabled, officeEmployee, hoursLabel, parking }) {
  const presets = usePresetWorkOrders();
  const input = (id, field, props = {}) => (
    <Input
      id={id}
      value={values[field]}
      onChange={(e) => onChange(field, e.target.value)}
      disabled={disabled}
      className="h-9 sm:h-10"
      {...props}
    />
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
        <div className={TIME_FIELDS}>
          <Label htmlFor="date" className="text-xs sm:text-sm">{t("form.date")}</Label>
          {input("date", "job_date", { type: "date" })}
        </div>

        <div className={TIME_FIELDS}>
          <Label htmlFor="ot" className="text-xs sm:text-sm"><span className="sm:hidden">{t("common.otLabel")}</span><span className="hidden sm:inline">{t("form.ot")}</span></Label>
          <OtField id="ot" value={values.ot} presets={presets} disabled={disabled} className="h-9 sm:h-10" placeholder={t("form.otPlaceholder")} onChange={(value) => onChange("ot", value)} />
        </div>

        <div className={TIME_FIELDS}>
          <Label htmlFor="depart" className="text-xs sm:text-sm">{officeEmployee ? t("form.debut") : t("form.depart")}</Label>
          {input("depart", "depart", { type: "time" })}
        </div>

        {!officeEmployee && (
          <div className={TIME_FIELDS}>
            <Label htmlFor="arrivee" className="text-xs sm:text-sm">{t("form.arrival")}</Label>
            {input("arrivee", "arrivee", { type: "time" })}
          </div>
        )}

        <div className={TIME_FIELDS}>
          <Label htmlFor="fin" className="text-xs sm:text-sm">{t("form.end")}</Label>
          {input("fin", "fin", { type: "time" })}
        </div>

        {!officeEmployee && (
          <div className={TIME_FIELDS}>
            <Label htmlFor="km" className="text-xs sm:text-sm"><span className="sm:hidden">{t("history.km")}</span><span className="hidden sm:inline">{t("form.kmTotal")}</span></Label>
            {input("km", "km_aller", { type: "number", placeholder: "0" })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:gap-4">
        <div className="grid min-w-[8rem] flex-1 gap-1 sm:gap-1.5">
          <Label className="text-xs sm:text-sm">{t("form.totalHours")}</Label>
          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-bold sm:h-10">
            {hoursLabel}
          </div>
        </div>

        {parking.enabled && (
          <label className="flex h-9 min-w-[9rem] flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 sm:h-10">
            <span className="text-sm font-medium">{t("form.parking.title")}</span>
            <input
              type="checkbox"
              checked={parking.requested}
              disabled={disabled || parking.hasReceipt}
              onChange={(event) => parking.onRequested(event.target.checked)}
              className="h-5 w-5 rounded border-input accent-primary"
            />
          </label>
        )}
      </div>
    </>
  );
}
