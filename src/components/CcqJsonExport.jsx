import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Download } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { loadDayRounding } from "@/lib/day-rounding";
import { buildCcqWeeklyRecords, missingCcqFields } from "@/lib/ccq-export";
import { isNonCcqRole } from "@/lib/roles";
import { withTimeout } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHolidayDates } from "@/lib/company-holidays";
import { useAuth } from "@/contexts/AuthContext";

// On screen the NAS is only a mask. The real values are read at download time through
// export_ccq_nas (migration 0084): owner only, written reason, password re-entry,
// audited and rate-limited. The browser never selects the vault table.
const NAS_MASK = "•••••••••";

export default function CcqJsonExport() {
  const holidayDates = useHolidayDates();
  const t = useT();
  const { user } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [roundingByUser, setRoundingByUser] = useState(new Map());
  const [employeeId, setEmployeeId] = useState("all");
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [{ data: jobRows, error: jobError }, { data: profileRows, error: profileError }, { data: nasRows }, rounding] = await withTimeout(
          Promise.all([
            fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, depart, arrivee, fin, return_time_minutes, status").eq("status", "approved").order("job_date", { ascending: true }).order("id")),
            supabase.from("profiles").select("id, full_name, email, role, work_region, wage_schedule, union_association, hourly_rate, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid").order("full_name"),
            // Presence only (no value): empty for a non-owner, whose export then lacks NAS.
            supabase.rpc("nas_presence"),
            loadDayRounding(),
          ]),
          12000
        );
        if (jobError) throw jobError;
        if (profileError) throw profileError;
        const withNas = new Set((nasRows || []).map((r) => r.user_id));
        setJobs(jobRows || []);
        setRoundingByUser(rounding);
        setProfiles((profileRows || []).map((p) => ({ ...p, nas_employee: withNas.has(p.id) ? NAS_MASK : null })));
      } catch (loadError) {
        setError(loadError?.message || t("manager.download.failedLoad"));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The CCQ report covers CCQ tradespeople only. Non-CCQ roles (administration,
  // subcontractors, and owner)
  // are paid flat-hourly off the CCQ grid, so they are excluded from this export.
  const ccqProfiles = useMemo(() => profiles.filter((profile) => !isNonCcqRole(profile.role)), [profiles]);

  const exportJobs = useMemo(() => {
    const ids = new Set(ccqProfiles.map((profile) => profile.id));
    return jobs.filter((job) => (employeeId === "all" || job.user_id === employeeId) && ids.has(job.user_id));
  }, [employeeId, jobs, ccqProfiles]);

  const buildRecords = (profileList) => buildCcqWeeklyRecords(
    exportJobs,
    new Map(profileList.map((profile) => [profile.id, profile])),
    { holidayDates, roundingByUser }
  ).filter((record) => !month || record.semaineFinissantLe.startsWith(month));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = useMemo(() => buildRecords(ccqProfiles), [exportJobs, month, ccqProfiles, holidayDates, roundingByUser]);

  const incomplete = records.filter((record) => missingCcqFields(record).length > 0);

  async function confirmExport() {
    setExportBusy(true);
    setExportError("");
    try {
      const { error: authError } = await withTimeout(supabase.auth.signInWithPassword({ email: user.email, password }), 12000);
      if (authError) throw new Error(t("employees.nasBadPassword"));
      const userIds = [...new Set(exportJobs.map((job) => job.user_id))];
      const { data, error: rpcError } = await withTimeout(
        supabase.rpc("export_ccq_nas", { p_user_ids: userIds, p_reason: reason.trim() }),
        12000
      );
      if (rpcError) {
        const code = String(rpcError.message || "");
        if (code.includes("export_reason_required")) throw new Error(t("manager.download.reasonTooShort"));
        if (code.includes("nas_export_rate_limited")) throw new Error(t("manager.download.rateLimited"));
        throw rpcError;
      }
      const nasByUser = new Map((data || []).map((row) => [row.user_id, row.nas]));
      const fullRecords = buildRecords(ccqProfiles.map((profile) => ({ ...profile, nas_employee: nasByUser.get(profile.id) || null })));
      downloadJson(fullRecords);
      setExportOpen(false);
      setReason("");
    } catch (exportFailure) {
      setExportError(exportFailure?.message || String(exportFailure));
    } finally {
      setPassword("");
      setExportBusy(false);
    }
  }

  function downloadJson(fullRecords) {
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
      records: fullRecords,
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
            <p className="mt-1 text-xs font-semibold text-warning">{t("manager.download.previewNotice")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="all">{t("manager.filters.allEmployees")}</option>
              {ccqProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
            </Select>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t("manager.download.reportingMonth")} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <b>{records.length}</b> {t("manager.download.weeklyRecords")}
              {incomplete.length > 0 && <div className="text-destructive">{t("manager.download.incomplete", { count: incomplete.length })}</div>}
            </div>
            <Button type="button" onClick={() => { setExportError(""); setExportOpen(true); }} disabled={loading || records.length === 0 || incomplete.length > 0}>
              <Download className="mr-2 h-4 w-4" />{t("manager.download.json")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("manager.download.policyNotice")}</p>
          <p className="text-xs text-muted-foreground">{t("manager.download.nasNotice")}</p>
        </CardContent>
      </Card>
      {loading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!loading && records.length > 0 && (
        <Card><CardContent className="p-0"><pre className="max-h-[36rem] overflow-auto p-4 text-xs">{JSON.stringify(records, null, 2)}</pre></CardContent></Card>
      )}
      <Dialog open={exportOpen} onOpenChange={(open) => { if (!exportBusy) setExportOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("manager.download.confirmTitle")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("manager.download.confirmBody", { count: new Set(exportJobs.map((job) => job.user_id)).size })}</p>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">{t("manager.download.reason")}</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("manager.download.reasonPlaceholder")} maxLength={500} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">{t("employees.nasPasswordPrompt")}</span>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"
              onKeyDown={(event) => { if (event.key === "Enter" && reason.trim().length >= 10 && password) confirmExport(); }} />
          </label>
          {exportError && <p className="text-sm text-destructive" role="alert">{exportError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={exportBusy} onClick={() => setExportOpen(false)}>{t("common.cancel")}</Button>
            <Button type="button" disabled={exportBusy || reason.trim().length < 10 || !password} onClick={confirmExport}>
              <Download className="mr-2 h-4 w-4" />{exportBusy ? t("common.working") : t("manager.download.json")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
