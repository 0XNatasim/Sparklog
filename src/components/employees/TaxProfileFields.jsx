import React from "react";
import { Input } from "@/components/ui/input";
import { TAX_FIELDS, parseAmount } from "@/lib/tax-profile";

// The fields of one employee's tax profile (employee_tax_profiles): Paramètres › Paie (V2) and the
// Impôts tab of the V3 employee card. `setField(id, key, value)` edits the row; saving is the caller's.

// TD1 / TP-1015.3 amounts and the date the forms were received.
export function TaxAmountFields({ t, row, setField }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {TAX_FIELDS.map(({ key, labelKey }) => (
        <label key={key} className="space-y-1">
          <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
          <Input inputMode="decimal" value={row[key]} onChange={(e) => setField(row.id, key, e.target.value)} placeholder={key.includes("additional") ? "0" : t("payrollSettings.basicAmount")} className="h-11 font-mono sm:h-10" />
        </label>
      ))}
      <label className="col-span-2 space-y-1 lg:col-span-1">
        <span className="text-xs text-muted-foreground">{t("payrollSettings.receivedOn")}</span>
        <Input type="date" value={row.forms_received_on} onChange={(e) => setField(row.id, "forms_received_on", e.target.value)} className="h-11 sm:h-10" />
      </label>
    </div>
  );
}

// Fixed weekly pay (hours × hourly rate every week, whatever the jobs) and the EI exemption
// (migration 0091). Read by computeEmployeeWeekTalon through the tax profile.
export function FixedPayFields({ t, row, setField }) {
  const hours = parseAmount(row.fixed_weekly_hours);
  const fmt = (v) => Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="space-y-2 rounded border bg-background p-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("payrollSettings.fixedHours")}</span>
          <Input inputMode="decimal" value={row.fixed_weekly_hours} onChange={(e) => setField(row.id, "fixed_weekly_hours", e.target.value)} placeholder="—" className="h-11 font-mono sm:h-10" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("payrollSettings.fixedStart")}</span>
          <Input type="date" value={row.fixed_pay_start} disabled={!hours} onChange={(e) => setField(row.id, "fixed_pay_start", e.target.value)} className="h-11 sm:h-10" />
        </label>
        <label title={t("payrollSettings.eiExemptHelp")} className="col-span-2 flex cursor-pointer items-center gap-2 self-end rounded border px-2 py-2 text-xs">
          <input type="checkbox" checked={row.ei_exempt} onChange={(e) => setField(row.id, "ei_exempt", e.target.checked)} className="h-5 w-5 shrink-0 rounded border-input accent-primary" />
          <span>{t("payrollSettings.eiExempt")}</span>
        </label>
        <label title={t("payrollSettings.rrqExemptHelp")} className="col-span-2 flex cursor-pointer items-center gap-2 self-end rounded border px-2 py-2 text-xs">
          <input type="checkbox" checked={row.rrq_exempt} onChange={(e) => setField(row.id, "rrq_exempt", e.target.checked)} className="h-5 w-5 shrink-0 rounded border-input accent-primary" />
          <span>{t("payrollSettings.rrqExempt")}</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {hours > 0
          ? (row.hourly_rate > 0
            ? t("payrollSettings.fixedPreview", { hours: fmt(hours), rate: fmt(row.hourly_rate), amount: fmt(hours * row.hourly_rate) })
            : <span className="text-warning">{t("payrollSettings.fixedNoRate")}</span>)
          : t("payrollSettings.fixedHoursHelp")}
        {row.ei_exempt ? <> · {t("payrollSettings.eiExemptHelp")}</> : null}
        {row.rrq_exempt ? <> · {t("payrollSettings.rrqExemptHelp")}</> : null}
      </p>
    </div>
  );
}
