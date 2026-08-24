import React, { useEffect, useState } from "react";
import { CalendarClock, LockOpen, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";

export default function TimeRulesManager() {
  const t = useT();
  const [deadline, setDeadline] = useState("23:59");
  const [holidays, setHolidays] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayLabel, setHolidayLabel] = useState("");
  const [unlockUser, setUnlockUser] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [{ data: settings }, { data: holidayRows }, { data: employeeRows }] = await Promise.all([
      supabase.from("company_time_settings").select("daily_deadline").eq("id", true).single(),
      supabase.from("company_holidays").select("holiday_date,label").order("holiday_date"),
      supabase.from("profiles").select("id,full_name,email").neq("role", "manager").order("full_name"),
    ]);
    setDeadline(String(settings?.daily_deadline || "23:59").slice(0, 5));
    setHolidays(holidayRows || []);
    setProfiles(employeeRows || []);
  }

  useEffect(() => { load(); }, []);

  async function saveDeadline() {
    const { error } = await supabase.from("company_time_settings").update({ daily_deadline: deadline, updated_at: new Date().toISOString() }).eq("id", true);
    setMessage(error?.message || t("timeRules.deadlineSaved"));
  }

  async function addHoliday() {
    if (!holidayDate || !holidayLabel.trim()) return;
    const { error } = await supabase.from("company_holidays").upsert({ holiday_date: holidayDate, label: holidayLabel.trim() });
    setMessage(error?.message || t("timeRules.holidaySaved"));
    if (!error) { setHolidayDate(""); setHolidayLabel(""); load(); }
  }

  async function removeHoliday(date) {
    await supabase.from("company_holidays").delete().eq("holiday_date", date);
    load();
  }

  async function unlockDay() {
    if (!unlockUser || !unlockDate) return;
    const { error } = await supabase.from("job_entry_unlocks").upsert({ user_id: unlockUser, job_date: unlockDate, unlocked_until: null }, { onConflict: "user_id,job_date" });
    setMessage(error?.message || t("timeRules.dayUnlocked"));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{t("timeRules.title")}</div>
        <p className="text-xs text-muted-foreground">{t("timeRules.description")}</p>
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium">{t("timeRules.deadline")}</label>
            <div className="flex gap-2"><Input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} /><Button type="button" onClick={saveDeadline}>{t("common.save")}</Button></div>
            <p className="text-xs text-muted-foreground">{t("timeRules.deadlineHelp")}</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium">{t("timeRules.holidays")}</label>
            <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            <Input value={holidayLabel} onChange={(e) => setHolidayLabel(e.target.value)} placeholder={t("timeRules.holidayName")} />
            <Button type="button" size="sm" onClick={addHoliday}>{t("timeRules.addHoliday")}</Button>
            <div className="space-y-1">{holidays.map((holiday) => <div key={holiday.holiday_date} className="flex items-center justify-between gap-2 text-xs"><span>{holiday.holiday_date} · {holiday.label}</span><Button type="button" size="icon" variant="ghost" onClick={() => removeHoliday(holiday.holiday_date)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium">{t("timeRules.unlock")}</label>
            <Select value={unlockUser} onChange={(e) => setUnlockUser(e.target.value)}><option value="">—</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</Select>
            <Input type="date" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} />
            <Button type="button" size="sm" onClick={unlockDay}><LockOpen className="mr-2 h-4 w-4" />{t("timeRules.unlockDay")}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
