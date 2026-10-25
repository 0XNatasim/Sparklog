import React from "react";
import { Briefcase, Eye, PauseCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isManagerRole } from "@/lib/roles";
import { addCalendarDays } from "@/lib/company-time";
import { roleName } from "@/lib/employees-panel";
import { DEPARTURE_STATUSES, MAX_DEPARTURE_NOTE, NEW_HIRE, employmentChoice, isNewHire } from "@/lib/signups";
import Field from "./EmployeeField";

// Top of an open employee card: the type a new account needs before activation, « Voir comme »,
// the missing CCQ fields, then employee number · role · active/paused · hiring or departure.
export default function EmployeeAccountSection({ profile: p, missingFields, panel }) {
  const { t, user, role, privileged, today, newHireDraft, setLocal, saveField, saveEmployment, chooseType, signupsChanged, navigate } = panel;
  return (
    <>
      {/* Type gate: a new account must be typed (Administration vs Employé CCQ)
          before it can be activated. Until then the activation toggle stays locked. */}
      {!p.type_confirmed && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Briefcase className="h-4 w-4" />{t("employees.chooseTypeTitle")}
          </div>
          <p className="text-xs text-muted-foreground">{t("employees.chooseTypeHint")}</p>
          {privileged ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "employee")}>
                {t("employees.typeCcq")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "admin")}>
                {t("employees.typeAdmin")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "subcontractor_1")}>
                {t("employees.typeSubcontractor1")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-warning">{t("employees.chooseTypeOwnerOnly")}</p>
          )}
        </div>
      )}
      {/* "View as" enters view mode, which is manager-tier only. A granted admin
          (office employee) manages here but cannot impersonate, so hide it for them. */}
      {p.id !== user?.id && isManagerRole(role) && (
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => navigate(`/form?employee=${p.id}&employeeName=${encodeURIComponent(p.full_name || p.email || "")}`)}>
          <Eye className="mr-1.5 h-4 w-4" />{t("employees.viewAs")}
        </Button>
      )}
      {missingFields.length > 0 && (
        <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("employees.missingTitle")}</b><div className="mt-1 text-xs">{missingFields.join(" · ")}</div></div>
        </div>
      )}
      {/* Ligne : No d'employé · Rôle · Actif/Inactif */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("employees.employeeNumber")}>
          <Input
            value={p.employee_number || ""}
            onChange={(e) => setLocal(p.id, "employee_number", e.target.value)}
            onBlur={(e) => saveField(p.id, "employee_number", e.target.value)}
            placeholder="09"
            className="h-9"
          />
        </Field>
        <Field label={t("employees.roleLabel")}>
          {/* Only the owner may assign roles (0031/0032); the owner's own row is locked
              to avoid demoting the last owner. Everyone else sees the role read-only. */}
          {privileged && p.type_confirmed ? (
            <Select
              value={p.role || "employee"}
              disabled={p.id === user?.id}
              onChange={(e) => { const v = e.target.value; setLocal(p.id, "role", v); saveField(p.id, "role", v); }}
              className="h-9"
            >
              <option value="employee">{t("manager.employee")}</option>
              <option value="subcontractor_1">{t("manager.subcontractor1Label")}</option>
              {p.role === "manager" && <option value="manager">{t("manager.roleLabel")}</option>}
              <option value="admin">{t("manager.adminLabel")}</option>
              <option value="owner">{t("manager.bossLabel")}</option>
            </Select>
          ) : (
            <Input value={roleName(p.role, t)} readOnly className="h-9 bg-muted" />
          )}
        </Field>
        <Field label={t("employees.pauseAccount")}>
          <label className={`flex h-9 items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/5 px-3 ${p.type_confirmed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <span className="flex items-center gap-2 text-sm font-medium"><PauseCircle className="h-4 w-4 text-warning" />{p.is_paused ? t("employees.paused") : t("employees.active")}</span>
            <input
              type="checkbox"
              checked={Boolean(p.is_paused)}
              disabled={!p.type_confirmed}
              onChange={async (e) => {
                const checked = e.target.checked;
                setLocal(p.id, "is_paused", checked);
                // Activating again clears a former-employee mark (the database does the same, 0109).
                if (!checked) setLocal(p.id, "departure_status", null);
                await saveField(p.id, "is_paused", checked);
                signupsChanged();
              }}
              className="h-5 w-5 rounded border-input accent-warning disabled:cursor-not-allowed"
            />
          </label>
          {!p.type_confirmed && <span className="text-xs text-warning">{t("employees.activateNeedsType")}</span>}
        </Field>
        {isManagerRole(role) && p.role !== "owner" && p.id !== user?.id && (
          <Field label={t("employees.departure.label")}>
            <Select
              value={newHireDraft.has(p.id) ? NEW_HIRE : employmentChoice(p, today)}
              onChange={(e) => saveEmployment(p, e.target.value)}
              className="h-9"
            >
              <option value="">{t("employees.departure.none")}</option>
              <option value={NEW_HIRE}>{t("employees.newHire.option")}</option>
              {DEPARTURE_STATUSES.map((status) => <option key={status} value={status}>{t(`employees.status.${status}`)}</option>)}
            </Select>
            {(newHireDraft.has(p.id) || isNewHire(p, today)) && (
              <label className="mt-2 block text-xs">
                <span className="text-muted-foreground">{t("employees.newHire.startDate")}</span>
                <Input
                  type="date"
                  className="mt-1 h-9"
                  min={addCalendarDays(today, 1)}
                  required
                  value={isNewHire(p, today) ? p.start_date : ""}
                  // Only a day after today: someone starting today is simply on the boards.
                  onChange={(e) => { if (e.target.value > today) saveEmployment(p, NEW_HIRE, e.target.value); }}
                />
                <span className="mt-1 block text-muted-foreground">
                  {newHireDraft.has(p.id) ? t("employees.newHire.needDate") : t("employees.newHire.hint")}
                </span>
              </label>
            )}
            {p.departure_status && (
              <Input
                className="mt-2 h-9"
                value={p.departure_note || ""}
                maxLength={MAX_DEPARTURE_NOTE}
                placeholder={t("employees.departure.note")}
                aria-label={t("employees.departure.note")}
                onChange={(e) => setLocal(p.id, "departure_note", e.target.value)}
                onBlur={(e) => saveField(p.id, "departure_note", e.target.value)}
              />
            )}
          </Field>
        )}
      </div>
    </>
  );
}
