import React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GRANTABLE_ADMIN_SECTIONS, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import Field from "./EmployeeField";

const SUMMARY = "flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden";

// Administration and owner: a simple flat hourly pay instead of the CCQ classification (subcontractors
// carry the CCQ configuration instead), and the Gestion access of an office employee (owner only).
export default function EmployeeOfficeSections({ profile: p, panel }) {
  const { t, privileged, mgmtOpen, setLocal, saveField, toggleManagement, toggleAdminSection } = panel;
  const managementOn = mgmtOpen.has(p.id) || p.admin_sections?.length > 0;
  return (
    <>
      {isNonCcqRole(p.role) && !isSubcontractorRole(p.role) && (
        <details className="group rounded-lg border" open>
          <summary className={SUMMARY}>
            <span className="truncate">{p.role === "subcontractor_1" ? t("employees.subcontractorTerms") : t("employees.adminPayroll")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t p-3">
            <Field label={t("employees.flatHourlyRate")}>
              <div className="flex h-9 items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={p.hourly_rate ?? ""}
                  onChange={(e) => setLocal(p.id, "hourly_rate", e.target.value)}
                  onBlur={(e) => saveField(p.id, "hourly_rate", e.target.value)}
                  placeholder="0.00"
                  className="h-9"
                />
                <span className="text-xs text-muted-foreground">/h</span>
              </div>
              <span className="text-xs text-muted-foreground">{t("employees.flatHourlyRateHint")}</span>
            </Field>
          </div>
        </details>
      )}

      {/* Management (Gestion) access for an office employee — owner only. Tick
          "Gestion" to reveal the section checklist; each ticked section becomes a
          tab the admin can open in the manager dashboard. */}
      {p.role === "admin" && privileged && (
        <details className="group rounded-lg border" open>
          <summary className={SUMMARY}>
            <span className="truncate">{t("employees.managementAccess")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <span className="text-sm font-medium">{t("employees.managementEnable")}</span>
              <input
                type="checkbox"
                checked={managementOn}
                onChange={(e) => toggleManagement(p, e.target.checked)}
                className="h-5 w-5 rounded border-input accent-primary"
              />
            </label>
            {managementOn && (
              <div className="space-y-1 rounded-md border p-3">
                <p className="mb-1 text-xs text-muted-foreground">{t("employees.managementHint")}</p>
                {GRANTABLE_ADMIN_SECTIONS.map((sectionId) => (
                  <label key={sectionId} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
                    <span>{t(`manager.sections.${sectionId}`)}</span>
                    <input
                      type="checkbox"
                      checked={(p.admin_sections || []).includes(sectionId)}
                      onChange={(e) => toggleAdminSection(p, sectionId, e.target.checked)}
                      className="h-5 w-5 rounded border-input accent-primary"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </>
  );
}
