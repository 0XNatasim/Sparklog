import React, { useEffect, useState } from "react";
import { Unlock, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Fold from "@/components/ui/fold";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { useConfirmDialog } from "@/components/ConfirmDialog";

const montrealDate = companyDate;

export default function TimeRulesManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [message, setMessage] = useState("");

  const [employees, setEmployees] = useState([]);
  const [unlockEmployee, setUnlockEmployee] = useState("");
  const [unlockDate, setUnlockDate] = useState(montrealDate());
  const [unlocks, setUnlocks] = useState([]);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const [teamLeaderEmployee, setTeamLeaderEmployee] = useState("");
  const [teamLeaderPremium, setTeamLeaderPremium] = useState("");
  const [teamLeaderBusy, setTeamLeaderBusy] = useState(false);

  async function load() {
    // Deadline, evidence retention and the CCQ calendar live in Réglage.
    const [{ data: employeeRows }, { data: unlockRows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, team_leader_premium, is_paused").order("full_name"),
      supabase.from("job_entry_unlocks").select("id, user_id, job_date, unlocked_until").order("job_date", { ascending: false }),
    ]);
    setEmployees((employeeRows || []).filter((employee) => !employee.is_paused));
    setUnlocks(unlockRows || []);
  }


  useEffect(() => { load(); }, []);


  const employeeName = (id) => {
    const e = employees.find((row) => row.id === id);
    return e?.full_name || e?.email || id;
  };

  async function unlockDay() {
    if (!unlockEmployee || !unlockDate) {
      setMessage(t("timeRules.selectEmployeeAndDate"));
      return;
    }
    setUnlockBusy(true);
    // unlocked_until null = open until the manager removes it. Upsert so a
    // second unlock for the same employee/day is a no-op instead of an error.
    const { error } = await supabase
      .from("job_entry_unlocks")
      .upsert({ user_id: unlockEmployee, job_date: unlockDate, unlocked_until: null }, { onConflict: "user_id,job_date" });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(await reopenSubmittedJobs(unlockEmployee, unlockDate));
      await load();
    }
    setUnlockBusy(false);
  }

  // Unlocking a day does not reopen jobs already submitted that day; offer to return them.
  async function reopenSubmittedJobs(userId, jobDate) {
    const { data: submitted, error } = await supabase
      .from("jobs")
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("job_date", jobDate)
      .eq("status", "submitted");
    if (error || !submitted?.length) return t("timeRules.dayUnlocked");
    const ok = await confirm(t("timeRules.reopenSubmittedConfirm", { name: employeeName(userId), count: submitted.length, date: jobDate }));
    if (!ok) return t("timeRules.dayUnlocked");
    const results = await Promise.all(submitted.map((job) => supabase.rpc("return_job_for_correction", {
      p_job_id: job.id,
      p_expected_updated_at: job.updated_at,
    })));
    const failed = results.filter((result) => result.error).length;
    return failed
      ? t("timeRules.reopenSubmittedPartial", { done: submitted.length - failed, failed })
      : t("timeRules.reopenSubmittedDone", { count: submitted.length });
  }

  async function removeUnlock(id) {
    setUnlockBusy(true);
    const { error } = await supabase.from("job_entry_unlocks").delete().eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage(t("timeRules.unlockRemoved"));
      setUnlocks((current) => current.filter((row) => row.id !== id));
    }
    setUnlockBusy(false);
  }

  function selectTeamLeader(id) {
    setTeamLeaderEmployee(id);
    const e = employees.find((row) => row.id === id);
    const current = Number(e?.team_leader_premium) || 0;
    setTeamLeaderPremium(current > 0 ? String(current) : "");
  }

  async function saveTeamLeader() {
    if (!teamLeaderEmployee) { setMessage(t("teamLeader.selectEmployee")); return; }
    const premium = parseFloat(String(teamLeaderPremium).replace(",", ".")) || 0;
    setTeamLeaderBusy(true);
    const { error } = await supabase.from("profiles").update({ team_leader_premium: premium }).eq("id", teamLeaderEmployee);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t("teamLeader.saved"));
      setTeamLeaderEmployee("");
      setTeamLeaderPremium("");
      await load();
    }
    setTeamLeaderBusy(false);
  }

  async function removeTeamLeader(id) {
    setTeamLeaderBusy(true);
    const { error } = await supabase.from("profiles").update({ team_leader_premium: 0 }).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage(t("teamLeader.removed"));
      await load();
    }
    setTeamLeaderBusy(false);
  }

  const teamLeaders = employees.filter((e) => Number(e.team_leader_premium) > 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}

        <Fold icon={Unlock} title={t("timeRules.unlock")}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("timeRules.unlockHelp")}</p>
            <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto] sm:items-end">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("notifications.employee")}</span>
                <Select value={unlockEmployee} onChange={(e) => setUnlockEmployee(e.target.value)}>
                  <option value="">{t("timeRules.chooseEmployee")}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("timeRules.unlockDate")}</span>
                <Input type="date" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} />
              </div>
              <Button type="button" disabled={unlockBusy} onClick={unlockDay}>{unlockBusy ? t("common.working") : t("timeRules.unlockDay")}</Button>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium">{t("timeRules.activeUnlocks")}</span>
              {unlocks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("timeRules.noUnlocks")}</p>
              ) : (
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {unlocks.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                      <span><b>{row.job_date}</b> · {employeeName(row.user_id)}</span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-destructive" disabled={unlockBusy} onClick={() => removeUnlock(row.id)}>{t("timeRules.remove")}</Button>
                    </div>
                  ))}
                </div>
              )}
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
                      <span><b>{leader.full_name || leader.email}</b> · +{Number(leader.team_leader_premium).toFixed(2)} $/h</span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-destructive" disabled={teamLeaderBusy} onClick={() => removeTeamLeader(leader.id)}>{t("timeRules.remove")}</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Fold>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
