import React, { useState } from "react";
import { BellOff, BellRing, ShieldAlert, ShieldCheck } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { canSetEmployment, employeeCardTabs } from "@/lib/employees-panel";
import { hasPayRules } from "@/lib/pay-options";
import TimeOffControls from "@/components/TimeOffControls";
import {
  EmployeeEmploymentField, EmployeeNumberField, EmployeePauseField, EmployeeRoleField, EmployeeTypeGate,
  MissingFieldsAlert, ViewAsButton,
} from "./EmployeeAccountSection";
import EmployeeContactSection from "./EmployeeContactSection";
import { CcqDataFields, CcqOptionsFields } from "./EmployeeCcqSection";
import { ManagementAccessFields, OfficePayFields } from "./EmployeeOfficeSections";
import { EmployeeDeleteBlock } from "./EmployeeDetails";
import PayOptionsFields from "./PayOptionsFields";
import EmployeeTaxTab from "./EmployeeTaxTab";
import Field from "./EmployeeField";

const BOX = "space-y-3 rounded-lg border p-3";

// The open V3 employee card (Gestion V3 › Équipe › Employés): one card with tabs instead of the V2
// card + Règles de temps + Paramètres › TD1. Same fields, same saves (the V2 pieces, reused).
// `status` = { mfa, pushOn, pushOff } for the Accès tab.
export default function EmployeeTabs({ profile: p, missingFields, panel, status }) {
  const { t, role } = panel;
  const tabs = employeeCardTabs(p, role);
  const [tab, setTab] = useState(tabs[0]);
  const active = tabs.includes(tab) ? tab : tabs[0];
  return (
    <CardContent className="space-y-3 border-t p-4">
      <EmployeeTypeGate profile={p} panel={panel} />
      <MissingFieldsAlert missingFields={missingFields} t={t} />
      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          {tabs.map((key) => <TabsTrigger key={key} value={key}>{t(`employees.tab.${key}`)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {active === "identity" && <IdentityTab profile={p} panel={panel} />}
        {active === "ccq" && <CcqDataFields profile={p} panel={panel} className={`${BOX} space-y-4`} />}
        {active === "pay" && <PayTab profile={p} panel={panel} />}
        {active === "tax" && <div className={BOX}><EmployeeTaxTab profile={p} t={t} /></div>}
        {active === "timeoff" && (
          <div className={BOX}>
            <p className="text-xs text-muted-foreground">{t("timeOff.description")}</p>
            <TimeOffControls employeeId={p.id} rows={panel.timeOff.get(p.id) || []} onChanged={panel.loadTimeOff} />
          </div>
        )}
        {active === "access" && <AccessTab profile={p} panel={panel} status={status} />}
      </div>
    </CardContent>
  );
}

// Identité: employee number, contact, CCQ card, birth date, NAS, hiring / last day, hiring or departure.
function IdentityTab({ profile: p, panel }) {
  return (
    <div className={BOX}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <EmployeeNumberField profile={p} panel={panel} />
        {canSetEmployment(p, panel) && <EmployeeEmploymentField profile={p} panel={panel} />}
      </div>
      <EmployeeContactSection profile={p} panel={panel} />
    </div>
  );
}

// Paie et options: flat rate (office), pay rules and reimbursements, team-leader premiums, receipts.
function PayTab({ profile: p, panel }) {
  const { t, setLocal, savePayToggle, savePayAmount } = panel;
  const office = isNonCcqRole(p.role) && !isSubcontractorRole(p.role);
  const ccqLike = !office;
  return (
    <>
      {office && <OfficePayFields profile={p} panel={panel} className={BOX} />}
      {hasPayRules(p.role) && (
        <div className={BOX}>
          <div className="text-sm font-semibold">{t("timeRules.payRules.title")}</div>
          <p className="text-xs text-muted-foreground">{t("timeRules.payRules.help")}</p>
          <PayOptionsFields t={t} row={p} onToggle={savePayToggle} onLocal={setLocal} onAmount={savePayAmount} />
        </div>
      )}
      {hasPayRules(p.role) && (
        <div className={BOX}>
          <div className="text-sm font-semibold">{t("teamLeader.title")}</div>
          <p className="text-xs text-muted-foreground">{t("teamLeader.help")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[["team_leader_premium", "teamLeader.premium"], ["team_leader_premium_ccq", "teamLeader.premiumCcq"]].map(([field, labelKey]) => (
              <Field key={field} label={t(labelKey)}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    value={p[field] ? String(p[field]) : ""}
                    onChange={(e) => setLocal(p.id, field, e.target.value)}
                    onBlur={(e) => savePayAmount(p.id, field, e.target.value)}
                    placeholder="0.00"
                    className="h-9 w-28 text-right font-mono"
                  />
                  <span className="text-xs text-muted-foreground">/h</span>
                </div>
              </Field>
            ))}
          </div>
        </div>
      )}
      {ccqLike && <CcqOptionsFields profile={p} panel={panel} className={BOX} note={false} />}
    </>
  );
}

// Accès: role, active / paused, Gestion sections of an office employee, two-factor and phone
// notifications, « Voir comme » and deleting a paused account.
function AccessTab({ profile: p, panel, status }) {
  const { t, privileged } = panel;
  return (
    <>
      <div className={BOX}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EmployeeRoleField profile={p} panel={panel} />
          <EmployeePauseField profile={p} panel={panel} />
        </div>
        <ul className="space-y-1 text-sm">
          {status.mfa === "on" && <li className="flex items-center gap-2 text-success"><ShieldCheck className="h-4 w-4" />{t("employees.mfaOn")}</li>}
          {status.mfa === "missing" && <li className="flex items-center gap-2 text-warning"><ShieldAlert className="h-4 w-4" />{t("employees.mfaMissing")}</li>}
          {status.pushOn && <li className="flex items-center gap-2 text-success"><BellRing className="h-4 w-4" />{t("employees.pushOn")}</li>}
          {status.pushOff && <li className="flex items-center gap-2 text-muted-foreground"><BellOff className="h-4 w-4" />{t("employees.pushOff")}</li>}
        </ul>
        <ViewAsButton profile={p} panel={panel} />
      </div>
      {p.role === "admin" && privileged && (
        <div className="rounded-lg border">
          <div className="p-3 text-sm font-semibold">{t("employees.managementAccess")}</div>
          <ManagementAccessFields profile={p} panel={panel} />
        </div>
      )}
      <EmployeeDeleteBlock profile={p} panel={panel} />
    </>
  );
}
