import React, { useEffect, useState } from "react";
import { CalendarDays, Clock, Route, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Fold from "@/components/ui/fold";
import { ANOMALY_LIMITS, anomalyLimitsFromSettings } from "@/lib/job-anomalies";
import { companyDate } from "@/lib/company-time";
import { isManagerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";

// Paramètres: company-wide editable parameters. Congés and Formulaires are their own pages.
export default function SettingsPanel() {
  return <GeneralSettings />;
}

function GeneralSettings() {
  const t = useT();
  const [message, setMessage] = useState("");
  const [longDayHours, setLongDayHours] = useState(String(ANOMALY_LIMITS.longDayMinutes / 60));
  const [highKm, setHighKm] = useState(String(ANOMALY_LIMITS.highKm));
  const [anomalySaving, setAnomalySaving] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [deadline, setDeadline] = useState("23:59");
  const [holidays, setHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    (async () => {
      const [{ data: settings }, { data: overtimeSettings }, { data: holidayRows }, { data: employeeRows }] = await Promise.all([
        supabase.from("company_time_settings").select("*").eq("id", true).single(),
        supabase.from("overtime_settings").select("evidence_retention_days").eq("id", true).single(),
        supabase.from("company_holidays").select("holiday_date,label").gte("holiday_date", companyDate()).order("holiday_date").limit(40),
        supabase.from("profiles").select("id, full_name, role, first_trip_unpaid").order("full_name", { ascending: true }),
      ]);
      const limits = anomalyLimitsFromSettings(settings);
      setLongDayHours(String(limits.longDayMinutes / 60));
      setHighKm(String(limits.highKm));
      setDeadline(String(settings?.daily_deadline || "23:59").slice(0, 5));
      setRetentionDays(overtimeSettings?.evidence_retention_days || 30);
      setHolidays(holidayRows || []);
      setEmployees((employeeRows || []).filter((p) => !isManagerRole(p.role)));
    })();
  }, []);

  async function saveAnomalyLimits() {
    const minutes = Math.round((parseFloat(String(longDayHours).replace(",", ".")) || 0) * 60);
    const km = Math.round(parseFloat(String(highKm).replace(",", ".")) || 0);
    if (minutes < 60 || minutes > 1440 || km < 1 || km > 5000) {
      setMessage(t("settings.anomalies.invalid"));
      return;
    }
    setAnomalySaving(true);
    const { error } = await supabase
      .from("company_time_settings")
      .update({ anomaly_long_day_minutes: minutes, anomaly_high_km: km, updated_at: new Date().toISOString() })
      .eq("id", true);
    setMessage(error?.message || t("settings.anomalies.saved"));
    setAnomalySaving(false);
  }

  async function saveRetentionDays() {
    const value = Math.min(365, Math.max(1, Number(retentionDays) || 30));
    setRetentionDays(value);
    setRetentionSaving(true);
    const { error } = await supabase.from("overtime_settings").update({ evidence_retention_days: value, updated_at: new Date().toISOString() }).eq("id", true);
    setMessage(error?.message || t("employees.retentionSaved"));
    setRetentionSaving(false);
  }

  async function toggleFirstTripUnpaid(id, checked) {
    setEmployees((rows) => rows.map((p) => (p.id === id ? { ...p, first_trip_unpaid: checked } : p)));
    const { error } = await supabase.from("profiles").update({ first_trip_unpaid: checked }).eq("id", id);
    if (error) {
      setEmployees((rows) => rows.map((p) => (p.id === id ? { ...p, first_trip_unpaid: !checked } : p)));
      setMessage(error.message);
    } else {
      setMessage(t("settings.firstTrip.saved"));
    }
  }

  async function saveDeadline() {
    const { error } = await supabase.from("company_time_settings").update({ daily_deadline: deadline, updated_at: new Date().toISOString() }).eq("id", true);
    setMessage(error?.message || t("timeRules.deadlineSaved"));
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {message && <div className="rounded-md border bg-muted px-3 py-2 text-xs">{message}</div>}

        <Fold icon={TriangleAlert} title={t("settings.anomalies.title")} defaultOpen>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("settings.anomalies.help")}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">{t("settings.anomalies.longDay")}</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" max="24" step="0.5" value={longDayHours} onChange={(e) => setLongDayHours(e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">h</span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">{t("settings.anomalies.highKm")}</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" max="5000" step="1" value={highKm} onChange={(e) => setHighKm(e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">km</span>
                </div>
              </label>
              <Button type="button" size="sm" disabled={anomalySaving} onClick={saveAnomalyLimits}>{anomalySaving ? t("common.saving") : t("common.save")}</Button>
            </div>
          </div>
        </Fold>

        <Fold icon={Route} title={t("settings.firstTrip.title")}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("settings.firstTrip.help")}</p>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {employees.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center justify-between gap-3 rounded border bg-muted/30 px-2 py-2 text-sm">
                  <span>{p.full_name || p.id}</span>
                  <input type="checkbox" checked={Boolean(p.first_trip_unpaid)} onChange={(e) => toggleFirstTripUnpaid(p.id, e.target.checked)} className="h-5 w-5 rounded border-input accent-primary" />
                </label>
              ))}
            </div>
          </div>
        </Fold>

        <Fold icon={ShieldCheck} title={t("employees.globalRetention")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">{t("employees.globalRetentionDescription")}</div>
            <div className="flex items-center gap-2">
              <Input type="number" min="1" max="365" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="w-24" />
              <span className="text-sm text-muted-foreground">{t("employees.days")}</span>
              <Button type="button" size="sm" disabled={retentionSaving} onClick={saveRetentionDays}>{retentionSaving ? t("common.saving") : t("common.save")}</Button>
            </div>
          </div>
        </Fold>

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
      </CardContent>
    </Card>
  );
}
