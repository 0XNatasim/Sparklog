import React from "react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isManagerRole, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import EmployeeAccountSection from "./EmployeeAccountSection";
import EmployeeContactSection from "./EmployeeContactSection";
import EmployeeOfficeSections from "./EmployeeOfficeSections";
import EmployeeCcqSection from "./EmployeeCcqSection";

// The open part of an employee card (Gestion › Employés). `panel` carries the panel's state and
// actions (see EmployeesPanel): every field is saved by the panel, this only lays them out.
export default function EmployeeDetails({ profile: p, missingFields, panel }) {
  return (
    <CardContent className="space-y-3 border-t p-4">
      <EmployeeAccountSection profile={p} missingFields={missingFields} panel={panel} />
      <EmployeeContactSection profile={p} panel={panel} />
      <EmployeeOfficeSections profile={p} panel={panel} />
      {(!isNonCcqRole(p.role) || isSubcontractorRole(p.role)) && <EmployeeCcqSection profile={p} panel={panel} />}

      <EmployeeDeleteBlock profile={p} panel={panel} />
    </CardContent>
  );
}

// Delete a paused account (not a manager's, never one's own): two clicks, then the delete_user function.
export function EmployeeDeleteBlock({ profile: p, panel }) {
  const { t, user, confirmDelete, deleting, setConfirmDelete, handleDelete } = panel;
  if (!p.is_paused || isManagerRole(p.role) || p.id === user?.id) return null;
  return (
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
  );
}
