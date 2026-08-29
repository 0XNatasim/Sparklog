import React, { useEffect, useState } from "react";
import { CalendarClock, Clock, CalendarDays, Unlock, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Fold from "@/components/ui/fold";
import { useT } from "@/lib/use-t";

function montrealDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function TimeRulesManager() {
  const t = useT();
  const [deadline, setDeadline] = useState("23:59");
  const [holidays, setHolidays] = useState([]);
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
    const [{ data: settings }, { data: holidayRows }, { data: employeeRows }, { data: unlockRows }] = await Promise.all([
      supabase.from("company_time_settings").select("daily_deadline").eq("id", true).single(),
      supabase.from("company_holidays").select("holiday_date,label").gte("holiday_date", montrealDate()).order("holiday_date").limit(40),
      supabase.from("profiles").select("id, full_name, email, team_leader_premium").order("full_name"),
      supabase.from("job_entry_unlocks").select("id, user_id, job_date, unlocked_until").order("job_date", { ascending: false }),
    ]);
    setDeadline(String(settings?.daily_deadline || "23:59").slice(0, 5));
    setHolidays(holidayRows || []);
    setEmployees(employeeRows || []);
    setUnlocks(unlockRows || []);
  }

  useEffect(() => { load(); }, []);

  async function saveDeadline() {
    const { error } = await supabase.from("company_time_settings").update({ daily_deadline: deadline, updated_at: new Date().toISOString() }).eq("id", true);
    setMessage(error?.message || t("timeRules.deadlineSaved"));
  }

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
      setMessage(t("timeRules.dayUnlocked"));
      await load();
    }
    setUnlockBusy(false);
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
        <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{t("timeRules.title")}</div>
        <p className="text-xs text-muted-foreground">{t("timeRules.description")}</p>
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}

        <Fold icon={Clock} title={t("timeRules.deadline")}>
          <div className="space-y-2">
            <div className="flex gap-2"><Input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} /><Button type="button" onClick={saveDeadline}>{t("common.save")}</Button></div>
            <p className="text-xs text-muted-foreground">{t("timeRules.deadlineHelp")}</p>
          </div>
        </Fold>

        <Fold icon={CalendarDays} title={t("timeRules.ccqCalendar")}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("timeRules.ccqCalendarHelp")}</p>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">{holidays.map((holiday) => <div key={holiday.holiday_date} className="rounded border bg-muted/30 px-2 py-1.5 text-xs"><b>{holiday.holiday_date}</b> · {holiday.label}</div>)}</div>
          </div>
        </Fold>

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
    </Card>
  );
}
