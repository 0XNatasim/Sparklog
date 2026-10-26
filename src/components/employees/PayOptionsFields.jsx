import React from "react";
import { Input } from "@/components/ui/input";
import { payRuleToggles, reimbursements } from "@/lib/pay-options";

// One employee's pay rules (boxes) and reimbursements (km rate, weekly phone data, weekly storage):
// Règles de temps (V2) and the « Paie et options » tab of the V3 employee card. `onToggle(id, field,
// checked)` saves a box, `onLocal(id, field, text)` edits an amount, `onAmount(id, field, text)` saves it.
export default function PayOptionsFields({ t, row, onToggle, onLocal, onAmount }) {
  const allowed = reimbursements(row.role);
  return (
    <>
      <div className="grid gap-1 md:grid-cols-3">
        {payRuleToggles(row).map((rule) => (
          <label key={rule.field} title={t(rule.hintKey)} className={`flex items-center justify-between gap-3 rounded border bg-background px-2 py-2 text-xs ${rule.locked ? "opacity-70" : "cursor-pointer"}`}>
            <span>{t(rule.labelKey)}</span>
            <input
              type="checkbox"
              checked={rule.locked ? rule.lockedValue : Boolean(row[rule.field])}
              disabled={rule.locked}
              onChange={(e) => onToggle(row.id, rule.field, e.target.checked)}
              className="h-5 w-5 shrink-0 rounded border-input accent-primary"
            />
          </label>
        ))}
      </div>
      {allowed.km && (
        <div className="mt-1 grid gap-1 md:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{t("employees.kmRate")}</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">$</span>
              <Input type="number" step="0.01" min="0" max="9.99" inputMode="decimal" value={row.km_rate ?? ""} onChange={(e) => onLocal(row.id, "km_rate", e.target.value)} onBlur={(e) => onAmount(row.id, "km_rate", e.target.value)} placeholder="0.65" className="h-8 w-20 text-right font-mono" />
              <span className="text-muted-foreground">/km</span>
            </span>
          </label>
          <label title={t("employees.phoneDataHint")} className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{t("employees.phoneData")}</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">$</span>
              <Input type="number" step="0.01" min="0" inputMode="decimal" value={row.phone_data_reimbursement ?? ""} onChange={(e) => onLocal(row.id, "phone_data_reimbursement", e.target.value)} onBlur={(e) => onAmount(row.id, "phone_data_reimbursement", e.target.value)} placeholder="7.00" className="h-8 w-20 text-right font-mono" />
              <span className="text-muted-foreground">/{t("employees.perWeek")}</span>
            </span>
          </label>
          {allowed.storage && (
            <div title={t("employees.storageHint")} className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(row.storage_compensation)}
                  onChange={(e) => onToggle(row.id, "storage_compensation", e.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-input accent-primary"
                />
                <span>{t("employees.storage")}</span>
              </label>
              <span className={`flex items-center gap-1 ${row.storage_compensation ? "" : "opacity-50"}`}>
                <span className="text-muted-foreground">$</span>
                <Input type="number" step="0.01" min="0" inputMode="decimal" aria-label={t("employees.storage")} disabled={!row.storage_compensation} value={row.storage_compensation_amount ?? ""} onChange={(e) => onLocal(row.id, "storage_compensation_amount", e.target.value)} onBlur={(e) => onAmount(row.id, "storage_compensation_amount", e.target.value)} placeholder="50.00" className="h-8 w-20 text-right font-mono" />
                <span className="text-muted-foreground">/{t("employees.perWeek")}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
