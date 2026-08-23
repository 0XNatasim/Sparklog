import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Download } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { buildCcqWeeklyRecords, missingCcqFields } from "@/lib/ccq-export";
import { withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function CcqJsonExport() {
  const t = useT();
  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [employeeId, setEmployeeId] = useState("all");
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [{ data: jobRows, error: jobError }, { data: profileRows, error: profileError }] = await withTimeout(
          Promise.all([
            supabase.from("jobs").select("id, user_id, job_date, depart, fin, return_time_minutes, status").eq("status", "approved").order("job_date", { ascending: true }),
            supabase.from("profiles").select("id, full_name, email, nas_employee, work_region, wage_schedule, hourly_rate").order("full_name"),
          ]),
          12000
        );
        if (jobError) throw jobError;
        if (profileError) throw profileError;
        setJobs(jobRows || []);
        setProfiles(profileRows || []);
      } catch (loadError) {
        setError(loadError?.message || t("manager.download.failedLoad"));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const records = useMemo(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    return buildCcqWeeklyRecords(
      jobs.filter((job) => employeeId === "all" || job.user_id === employeeId),
      profileMap
    ).filter((record) => !month || record.semaineFinissantLe.startsWith(month));
  }, [employeeId, jobs, month, profiles]);

  const incomplete = records.filter((record) => missingCcqFields(record).length > 0);

  function downloadJson() {
    const payload = {
      schemaVersion: "ccq-weekly-v1",
      generatedAt: new Date().toISOString(),
      reportingMonth: month || null,
      calculationPolicy: {
        weekEndingDay: "SATURDAY",
        regularWeeklyThresholdHours: 40,
        regularDailyThresholdHours: 8,
        firstDailyOvertimeHoursAt50Percent: 1,
        sundayHoursAt100Percent: true,
        statutoryHolidaysConfigured: false,
      },
      records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sparklog_ccq_${month || "all"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="font-semibold">{t("manager.download.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("manager.download.description")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="all">{t("manager.filters.allEmployees")}</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
            </Select>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t("manager.download.reportingMonth")} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <b>{records.length}</b> {t("manager.download.weeklyRecords")}
              {incomplete.length > 0 && <div className="text-destructive dark:text-red-300">{t("manager.download.incomplete", { count: incomplete.length })}</div>}
            </div>
            <Button type="button" onClick={downloadJson} disabled={loading || records.length === 0 || incomplete.length > 0}>
              <Download className="mr-2 h-4 w-4" />{t("manager.download.json")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("manager.download.policyNotice")}</p>
        </CardContent>
      </Card>
      {loading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
      {!loading && records.length > 0 && (
        <Card><CardContent className="p-0"><pre className="max-h-[36rem] overflow-auto p-4 text-xs">{JSON.stringify(records, null, 2)}</pre></CardContent></Card>
      )}
    </div>
  );
}
