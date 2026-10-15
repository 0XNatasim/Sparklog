import React, { useEffect, useState } from "react";
import { Scale, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Fold from "@/components/ui/fold";
import { useT } from "@/lib/use-t";
import { isAdminEmployee, isManagerRole, isNonCcqRole, isSubcontractorRole } from "@/lib/roles";

export default function TimeRulesManager() {
  const t = useT();
  const [message, setMessage] = useState("");

  const [employees, setEmployees] = useState([]);

  const [payRuleRows, setPayRuleRows] = useState([]);

  const [teamLeaderEmployee, setTeamLeaderEmployee] = useState("");
  const [teamLeaderPremium, setTeamLeaderPremium] = useState("");
  const [teamLeaderCcqPremium, setTeamLeaderCcqPremium] = useState("");
  const [teamLeaderBusy, setTeamLeaderBusy] = useState(false);

  async function load() {
    // Deadline, evidence retention and the CCQ calendar live in Réglage.
    // Day unlocks live in Temps › Rouvrir une journée (UnlockDayManager).
    const { data: employeeRows } = await supabase.from("profiles").select("id, full_name, email, role, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, is_paused, first_trip_unpaid, overtime_first_hour_double, return_with_benefits_to_8h, km_rate, phone_data_reimbursement, storage_compensation, storage_compensation_amount").order("full_name");
    setEmployees((employeeRows || []).filter((employee) => !employee.is_paused));
    setPayRuleRows((employeeRows || []).filter((employee) => !isManagerRole(employee.role)));
  }


  useEffect(() => { load(); }, []);


  function selectTeamLeader(id) {
    setTeamLeaderEmployee(id);
    const e = employees.find((row) => row.id === id);
    const current = Number(e?.team_leader_premium) || 0;
    setTeamLeaderPremium(current > 0 ? String(current) : "");
    const currentCcq = Number(e?.team_leader_premium_ccq) || 0;
    setTeamLeaderCcqPremium(currentCcq > 0 ? String(currentCcq) : "");
  }

  async function saveTeamLeader() {
    if (!teamLeaderEmployee) { setMessage(t("teamLeader.selectEmployee")); return; }
    const premium = parseFloat(String(teamLeaderPremium).replace(",", ".")) || 0;
    const ccqPremium = parseFloat(String(teamLeaderCcqPremium).replace(",", ".")) || 0;
    if (premium < 0 || ccqPremium < 0) { setMessage(t("timeRules.payRules.invalidAmount")); return; }
    setTeamLeaderBusy(true);
    const { error } = await supabase.from("profiles").update({ team_leader_premium: premium, team_leader_premium_ccq: ccqPremium }).eq("id", teamLeaderEmployee);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t("teamLeader.saved"));
      setTeamLeaderEmployee("");
      setTeamLeaderPremium("");
      setTeamLeaderCcqPremium("");
      await load();
    }
    setTeamLeaderBusy(false);
  }

  // Per-employee pay rules (optimistic, reverted if the update fails).
  async function setPayRule(id, field, checked) {
    const patch = (value) => setPayRuleRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    patch(checked);
    const { error } = await supabase.from("profiles").update({ [field]: checked }).eq("id", id);
    if (error) {
      patch(!checked);
      setMessage(error.message);
    } else {
      setMessage(t("timeRules.payRules.saved"));
    }
  }

  // Per-employee reimbursements (km rate, weekly phone data, weekly storage). Edited locally, saved
  // on blur; an empty field means none (no km rate / a 0 $ allowance).
  function setPayRuleLocal(id, field, value) {
    setPayRuleRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  async function savePayAmount(id, field, rawValue) {
    const text = String(rawValue ?? "").trim().replace(",", ".");
    const value = text === "" ? (field === "km_rate" ? null : 0) : Number(text);
    if (value != null && (Number.isNaN(value) || value < 0)) {
      setMessage(t("timeRules.payRules.invalidAmount"));
      return;
    }
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (error) {
      setMessage(error.message);
      await load();
    } else {
      setMessage(t("timeRules.payRules.saved"));
    }
  }

  async function removeTeamLeader(id) {
    setTeamLeaderBusy(true);
    const { error } = await supabase.from("profiles").update({ team_leader_premium: 0, team_leader_premium_ccq: 0 }).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage(t("teamLeader.removed"));
      await load();
    }
    setTeamLeaderBusy(false);
  }

  const teamLeaders = employees.filter((e) => Number(e.team_leader_premium) > 0 || Number(e.team_leader_premium_ccq) > 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}

        <Fold icon={Scale} title={t("timeRules.payRules.title")}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("timeRules.payRules.help")}</p>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {payRuleRows.map((row) => {
                const fixed = isSubcontractorRole(row.role);
                // Office (admin) employees have no km/phone reimbursement; storage is CCQ-only.
                const reimbursable = !isAdminEmployee(row.role);
                const storageEligible = !isNonCcqRole(row.role);
                const rules = [
                  { field: "first_trip_unpaid", label: t("settings.firstTrip.title"), hint: t("settings.firstTrip.help"), locked: false },
                  // Subcontractors: return always at the simple rate, first OT hour always double.
                  { field: "return_with_benefits_to_8h", label: t("employees.returnWithBenefits"), hint: t("employees.returnWithBenefitsHint"), locked: fixed, lockedValue: false },
                  { field: "overtime_first_hour_double", label: t("employees.otFirstHourDouble"), hint: t("employees.otFirstHourDoubleHint"), locked: fixed, lockedValue: true },
                  ...(Number(row.team_leader_premium) > 0 || Number(row.team_leader_premium_ccq) > 0
                    ? [{ field: "team_leader_premium_overtime", label: t("employees.premiumOnOvertime"), hint: t("employees.premiumOnOvertimeHint"), locked: fixed, lockedValue: false }]
                    : []),
                ];
                return (
                  <div key={row.id} className="rounded border bg-muted/30 px-3 py-2">
                    <div className="mb-1 text-sm font-semibold">{row.full_name || row.email || row.id}{fixed ? <span className="ml-2 text-xs font-normal text-muted-foreground">{t("timeRules.payRules.subcontractor")}</span> : null}</div>
                    <div className="grid gap-1 md:grid-cols-3">
                      {rules.map((rule) => (
                        <label key={rule.field} title={rule.hint} className={`flex items-center justify-between gap-3 rounded border bg-background px-2 py-2 text-xs ${rule.locked ? "opacity-70" : "cursor-pointer"}`}>
                          <span>{rule.label}</span>
                          <input
                            type="checkbox"
                            checked={rule.locked ? rule.lockedValue : Boolean(row[rule.field])}
                            disabled={rule.locked}
                            onChange={(e) => setPayRule(row.id, rule.field, e.target.checked)}
                            className="h-5 w-5 shrink-0 rounded border-input accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                    {reimbursable && (
                      <div className="mt-1 grid gap-1 md:grid-cols-3">
                        <label className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
                          <span>{t("employees.kmRate")}</span>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">$</span>
                            <Input type="number" step="0.01" min="0" max="9.99" inputMode="decimal" value={row.km_rate ?? ""} onChange={(e) => setPayRuleLocal(row.id, "km_rate", e.target.value)} onBlur={(e) => savePayAmount(row.id, "km_rate", e.target.value)} placeholder="0.65" className="h-8 w-20 text-right font-mono" />
                            <span className="text-muted-foreground">/km</span>
                          </span>
                        </label>
                        <label title={t("employees.phoneDataHint")} className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
                          <span>{t("employees.phoneData")}</span>
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">$</span>
                            <Input type="number" step="0.01" min="0" inputMode="decimal" value={row.phone_data_reimbursement ?? ""} onChange={(e) => setPayRuleLocal(row.id, "phone_data_reimbursement", e.target.value)} onBlur={(e) => savePayAmount(row.id, "phone_data_reimbursement", e.target.value)} placeholder="7.00" className="h-8 w-20 text-right font-mono" />
                            <span className="text-muted-foreground">/{t("employees.perWeek")}</span>
                          </span>
                        </label>
                        {storageEligible && (
                          <div title={t("employees.storageHint")} className="flex items-center justify-between gap-3 rounded border bg-background px-2 py-1.5 text-xs">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(row.storage_compensation)}
                                onChange={(e) => setPayRule(row.id, "storage_compensation", e.target.checked)}
                                className="h-5 w-5 shrink-0 rounded border-input accent-primary"
                              />
                              <span>{t("employees.storage")}</span>
                            </label>
                            <span className={`flex items-center gap-1 ${row.storage_compensation ? "" : "opacity-50"}`}>
                              <span className="text-muted-foreground">$</span>
                              <Input type="number" step="0.01" min="0" inputMode="decimal" aria-label={t("employees.storage")} disabled={!row.storage_compensation} value={row.storage_compensation_amount ?? ""} onChange={(e) => setPayRuleLocal(row.id, "storage_compensation_amount", e.target.value)} onBlur={(e) => savePayAmount(row.id, "storage_compensation_amount", e.target.value)} placeholder="50.00" className="h-8 w-20 text-right font-mono" />
                              <span className="text-muted-foreground">/{t("employees.perWeek")}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Fold>

        <Fold icon={Users} title={t("teamLeader.title")}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("teamLeader.help")}</p>
            <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto] sm:items-end">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("notifications.employee")}</span>
                <Select value={teamLeaderEmployee} onChange={(e) => selectTeamLeader(e.target.value)}>
                  <option value="">{t("timeRules.chooseEmployee")}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("teamLeader.premium")}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    value={teamLeaderPremium}
                    onChange={(e) => setTeamLeaderPremium(e.target.value)}
                    placeholder="0.00"
                    className="w-24 text-right font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground" title={t("teamLeader.premiumCcqHint")}>{t("teamLeader.premiumCcq")}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    value={teamLeaderCcqPremium}
                    onChange={(e) => setTeamLeaderCcqPremium(e.target.value)}
                    placeholder="0.00"
                    aria-label={t("teamLeader.premiumCcq")}
                    className="w-24 text-right font-mono"
                  />
                </div>
              </div>
              <Button type="button" disabled={teamLeaderBusy} onClick={saveTeamLeader}>{teamLeaderBusy ? t("common.working") : t("common.save")}</Button>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium">{t("teamLeader.current")}</span>
              {teamLeaders.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("teamLeader.none")}</p>
              ) : (
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {teamLeaders.map((leader) => (
                    <div key={leader.id} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                      <span>
                        <b>{leader.full_name || leader.email}</b>
                        {Number(leader.team_leader_premium) > 0 && <> · {t("teamLeader.premiumShort")} +{Number(leader.team_leader_premium).toFixed(2)} $/h</>}
                        {Number(leader.team_leader_premium_ccq) > 0 && <> · {t("teamLeader.premiumCcqShort")} +{Number(leader.team_leader_premium_ccq).toFixed(2)} $/h</>}
                      </span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-destructive" disabled={teamLeaderBusy} onClick={() => removeTeamLeader(leader.id)}>{t("timeRules.remove")}</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Fold>
      </CardContent>
    </Card>
  );
}
