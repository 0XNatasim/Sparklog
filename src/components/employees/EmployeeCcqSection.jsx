import React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isAdminEmployee, isSubcontractorRole } from "@/lib/roles";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { COMMERCIAL_RATE_SECTOR } from "@/lib/ccq-rates";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";
import { LEVELS } from "@/lib/employees-panel";
import Field from "./EmployeeField";

const SUMMARY = "flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden";

// « Données CCQ » (classification and payroll/export data) and « Avantages » of a CCQ tradesperson or
// a subcontractor (same configuration, with a manual simple + double rate). Not admin/owner.
// « Données CCQ »: CCQ number, level, trade, card expiry, region, union, wage schedule and the rate (automatic
// from the CCQ grid; manual simple + double rate for a subcontractor).
export function CcqDataFields({ profile: p, panel, className = "space-y-4 border-t p-3" }) {
  const { t, annexes, setLocal, saveField, saveClassification, saveAnnex } = panel;
  const available = annexes.get(COMMERCIAL_RATE_SECTOR) || [];
  const subcontractor = isSubcontractorRole(p.role);
  return (
    <div className={className}>
      {/* Classification */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="CCQ#">
          <Input
            value={p.ccq_number || ""}
            onChange={(e) => setLocal(p.id, "ccq_number", e.target.value)}
            onBlur={(e) => saveField(p.id, "ccq_number", e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label={t("employees.level")}>
          <Select
            value={p.apprentice_level || ""}
            onChange={(e) => saveClassification(p, "apprentice_level", e.target.value)}
            className="h-9"
          >
            <option value="">—</option>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.sector")}>
          <Input value={t("employees.commercialSector")} readOnly className="h-9 bg-muted" />
        </Field>
      </div>

      <div className="rounded-lg bg-muted/20 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("employees.tradeCode")}>
            <Input value="220" readOnly className="h-9 bg-muted" />
          </Field>
          <Field label={t("employees.ccqExpirationDate")}>
            <Input type="date" value={p.ccq_expiration_date || ""} onChange={(e) => setLocal(p.id, "ccq_expiration_date", e.target.value)} onBlur={(e) => saveField(p.id, "ccq_expiration_date", e.target.value)} className="h-9" />
          </Field>
          <Field label={t("employees.workRegion")}>
            <Select value={p.work_region || ""} onChange={(e) => { setLocal(p.id, "work_region", e.target.value); saveField(p.id, "work_region", e.target.value); }} className="h-9">
              <option value="">—</option>
              {QUEBEC_REGIONS.map((region) => <option key={region.code} value={region.code}>{region.code} — {region.name}</option>)}
            </Select>
          </Field>
          <Field label={t("employees.unionAssociation")}>
            <Select value={p.union_association || ""} onChange={(e) => { setLocal(p.id, "union_association", e.target.value); saveField(p.id, "union_association", e.target.value); }} className="h-9">
              <option value="">—</option>
              {UNION_ASSOCIATIONS.map((association) => <option key={association.code} value={association.code}>{association.name}</option>)}
            </Select>
          </Field>
          <Field label={t("employees.wageSchedule")}>
            {available.length > 0 ? (
              <Select value={p.wage_schedule || ""} onChange={(e) => saveAnnex(p, e.target.value)} className="h-9">
                <option value="">—</option>
                {available.map((annex) => <option key={annex.code} value={annex.code}>{annex.code}{annex.description ? ` — ${annex.description}` : ""}</option>)}
                {p.wage_schedule && !available.some((annex) => annex.code === p.wage_schedule) && <option value={p.wage_schedule}>{p.wage_schedule}</option>}
              </Select>
            ) : (
              <>
                <Input value={p.wage_schedule || ""} placeholder="C3" onChange={(e) => setLocal(p.id, "wage_schedule", e.target.value.toUpperCase())} onBlur={(e) => saveField(p.id, "wage_schedule", e.target.value.toUpperCase())} className="h-9" />
                <span className="text-xs text-warning">{t("employees.wageScheduleManual")}</span>
              </>
            )}
            <span className="text-xs text-muted-foreground">{t("employees.wageScheduleDescription")}</span>
          </Field>
          {subcontractor ? (
            <>
              <Field label={t("employees.simpleHourlyRate")}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" value={p.hourly_rate ?? ""} onChange={(e) => setLocal(p.id, "hourly_rate", e.target.value)} onBlur={(e) => saveField(p.id, "hourly_rate", e.target.value)} placeholder="0.00" className="h-9" />
                  <span className="text-xs text-muted-foreground">/h</span>
                </div>
              </Field>
              <Field label={t("employees.doubleHourlyRate")}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" value={p.hourly_rate_double ?? ""} onChange={(e) => setLocal(p.id, "hourly_rate_double", e.target.value)} onBlur={(e) => saveField(p.id, "hourly_rate_double", e.target.value)} placeholder="0.00" className="h-9" />
                  <span className="text-xs text-muted-foreground">/h</span>
                </div>
                <span className="text-xs text-muted-foreground">{t("employees.doubleHourlyRateHint")}</span>
              </Field>
            </>
          ) : (
            <Field label={t("employees.hourlyRate")}>
              <Input type="number" value={p.hourly_rate ?? ""} readOnly className="h-9 bg-muted" />
              <span className="text-xs text-muted-foreground">{t("employees.hourlyRateAutomatic")}</span>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// « Avantages »: parking receipts and inventory screenshots, and the subcontractor rule. `note`: the line
// saying where the pay amounts are (V2 only; the V3 card shows them in the same tab).
export function CcqOptionsFields({ profile: p, panel, className = "space-y-3 border-t p-3", note = true }) {
  const { t, setLocal, saveField } = panel;
  const subcontractor = isSubcontractorRole(p.role);
  const toggle = (field) => (e) => { const checked = e.target.checked; setLocal(p.id, field, checked); saveField(p.id, field, checked); };
  return (
    <div className={className}>
      {note && <p className="text-xs text-muted-foreground">{t("employees.payAmountsMoved")}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
          <span className="text-sm font-medium">{t("employees.parkingReceipts")}</span>
          <input type="checkbox" checked={Boolean(p.parking_receipts_enabled)} onChange={toggle("parking_receipts_enabled")} className="h-5 w-5 rounded border-input accent-warning" />
        </label>
        {!isAdminEmployee(p.role) && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
            <span className="text-sm font-medium">{t("employees.inventoryScreenshots")}</span>
            <input type="checkbox" checked={Boolean(p.inventory_screenshots_enabled)} onChange={toggle("inventory_screenshots_enabled")} className="h-5 w-5 rounded border-input accent-primary" />
          </label>
        )}
        {subcontractor && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-xs md:col-span-2">
            <div className="font-semibold text-primary">{t("employees.subcontractorRuleTitle")}</div>
            <p className="mt-1 text-muted-foreground">{t("employees.subcontractorRuleHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EmployeeCcqSection({ profile: p, panel }) {
  const { t } = panel;
  return (
    <>
      <details className="group rounded-lg border">
        <summary className={SUMMARY}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{t("employees.ccqExport")}</span>
            <span className="hidden text-xs font-normal text-muted-foreground sm:inline">CCQ# {p.ccq_number || "—"}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <CcqDataFields profile={p} panel={panel} />
      </details>

      {/* Avantages — compensation extras + politiques de temps supplémentaire. */}
      <details className="group rounded-lg border">
        <summary className={SUMMARY}>
          <span className="truncate">{t("employees.benefitsTitle")}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <CcqOptionsFields profile={p} panel={panel} />
      </details>
    </>
  );
}
