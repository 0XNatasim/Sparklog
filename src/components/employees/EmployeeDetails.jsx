import React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isManagerRole, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import TimeOffControls from "@/components/TimeOffControls";
import EmployeeAccountSection from "./EmployeeAccountSection";
import EmployeeContactSection from "./EmployeeContactSection";
import EmployeeOfficeSections from "./EmployeeOfficeSections";
import EmployeeCcqSection from "./EmployeeCcqSection";

// The open part of an employee card (Gestion › Employés). `panel` carries the panel's state and
// actions (see EmployeesPanel): every field is saved by the panel, this only lays them out.
export default function EmployeeDetails({ profile: p, missingFields, panel }) {
  const { t, user, timeOff, loadTimeOff, confirmDelete, deleting, setConfirmDelete, handleDelete } = panel;
  const rows = timeOff.get(p.id) || [];
  return (
    <CardContent className="space-y-3 border-t p-4">
      <EmployeeAccountSection profile={p} missingFields={missingFields} panel={panel} />
      <EmployeeContactSection profile={p} panel={panel} />

      {/* Time off (day off / week off) */}
      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />{t("timeOff.title")}
            {rows.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{rows.length}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-3">
          <p className="mb-2 text-xs text-muted-foreground">{t("timeOff.description")}</p>
          <TimeOffControls employeeId={p.id} rows={rows} onChanged={loadTimeOff} />
        </div>
      </details>

      <EmployeeOfficeSections profile={p} panel={panel} />
      {(!isNonCcqRole(p.role) || isSubcontractorRole(p.role)) && <EmployeeCcqSection profile={p} panel={panel} />}

      {p.is_paused && !isManagerRole(p.role) && p.id !== user?.id && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-destructive">{t("employees.deleteUser")}</span>
            {confirmDelete === p.id ? (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
                <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={() => handleDelete(p)}>{deleting ? t("common.saving") : t("employees.deleteConfirm")}</Button>
              </div>
            ) : (
              <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmDelete(p.id)}>{t("employees.deleteUser")}</Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("employees.deleteHint")}</p>
        </div>
      )}
    </CardContent>
  );
}
