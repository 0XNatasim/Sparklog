import React, { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  async function load() {
    const [{ data: settings }, { data: holidayRows }] = await Promise.all([
      supabase.from("company_time_settings").select("daily_deadline").eq("id", true).single(),
      supabase.from("company_holidays").select("holiday_date,label").gte("holiday_date", montrealDate()).order("holiday_date").limit(40),
    ]);
    setDeadline(String(settings?.daily_deadline || "23:59").slice(0, 5));
    setHolidays(holidayRows || []);
  }

  useEffect(() => { load(); }, []);

  async function saveDeadline() {
    const { error } = await supabase.from("company_time_settings").update({ daily_deadline: deadline, updated_at: new Date().toISOString() }).eq("id", true);
    setMessage(error?.message || t("timeRules.deadlineSaved"));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{t("timeRules.title")}</div>
        <p className="text-xs text-muted-foreground">{t("timeRules.description")}</p>
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium">{t("timeRules.deadline")}</label>
            <div className="flex gap-2"><Input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} /><Button type="button" onClick={saveDeadline}>{t("common.save")}</Button></div>
            <p className="text-xs text-muted-foreground">{t("timeRules.deadlineHelp")}</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <label className="text-sm font-medium">{t("timeRules.ccqCalendar")}</label>
            <p className="text-xs text-muted-foreground">{t("timeRules.ccqCalendarHelp")}</p>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">{holidays.map((holiday) => <div key={holiday.holiday_date} className="rounded border bg-muted/30 px-2 py-1.5 text-xs"><b>{holiday.holiday_date}</b> · {holiday.label}</div>)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
