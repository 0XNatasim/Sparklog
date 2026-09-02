import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { hoursBetween, formatHours } from "../lib/time";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status";
import { useT } from "@/lib/use-t";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";
import { withTimeout } from "@/lib/utils";
import JobCaptureIcons from "@/components/JobCaptureIcons";

dayjs.locale("en");

function fmtTimeHHmm(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function toHHmmLabelFromFormatHours(formatHoursResult) {
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

function kmTotal(job) {
  return getKilometreBreakdown(job || {}).totalKm;
}

export default function History() {
  const { user } = useAuth();
  const { isViewMode, viewedEmployee } = useViewMode();
  const effectiveUserId = isViewMode ? (viewedEmployee?.id || user?.id) : user?.id;
  const navigate = useNavigate();
  const t = useT();

  const [jobs, setJobs] = useState([]);
  const [mealJobIds, setMealJobIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [actionLoadingKey, setActionLoadingKey] = useState(null);

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const [jobsResult, mealsResult] = await withTimeout(
        Promise.all([
          supabase
            .from("jobs")
            .select("*")
            .eq("user_id", effectiveUserId)
            .order("job_date", { ascending: false })
            .order("updated_at", { ascending: false }),
          supabase.from("meal_claims").select("job_id").eq("user_id", effectiveUserId),
        ]),
        12000
      );
      if (jobsResult.error) throw jobsResult.error;
      if (mealsResult.error) throw mealsResult.error;
      setJobs(jobsResult.data || []);
      setMealJobIds(new Set((mealsResult.data || []).map((claim) => claim.job_id)));
    } catch (e) {
      setErr(e?.message || t("history.errors.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!effectiveUserId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  function sumHoursForJobs(list) {
    let total = 0;
    for (const j of list) {
      const d1 = makeDayjsFromJob(j.job_date, j.depart);
      const d2 = makeDayjsFromJob(j.job_date, j.fin);
      total += hoursBetween(d1, d2) || 0;
    }
    return total;
  }

  function sumKmForJobs(list) {
    let total = 0;
    for (const j of list) total += kmTotal(j);
    return Math.round(total * 100) / 100;
  }

  const grouped = useMemo(() => {
    const map = new Map();

    for (const j of jobs) {
      const key = dayjs(j.job_date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }

    return Array.from(map.entries()).map(([date, list]) => {
      const totalHours = sumHoursForJobs(list);
      const totalHHmm = toHHmmLabelFromFormatHours(formatHours(totalHours));
      const totalKm = sumKmForJobs(list);

      const submittableIds = list
        .filter((x) => (x.status === "saved" || x.status === "updated") && x.locked === false)
        .map((x) => x.id);

      return { date, list, totalHHmm, totalKm, submittableIds };
    });
  }, [jobs]);

  function openJob(job) {
    navigate(`/form?edit=${job.id}`);
  }

  function isOwner(job) {
    return Boolean(user?.id) && job.user_id === user.id;
  }
  function canOpen(job) {
    return isOwner(job) && (job.status === "saved" || job.status === "updated") && job.locked === false;
  }
  function canDelete(job) {
    return isOwner(job) && (job.status === "saved" || job.status === "updated") && job.locked === false;
  }
  function canSubmit(job) {
    return isOwner(job) && (job.status === "saved" || job.status === "updated") && job.locked === false;
  }

  async function deleteJob(jobId) {
    const ok = window.confirm(t("history.confirm.delete"));
    if (!ok) return;
    setActionLoadingKey(jobId);
    setErr(""); setInfo("");
    try {
      // Collect the screenshot file paths before deleting the job — the DB rows
      // cascade away on delete, but the storage files must be removed explicitly.
      const [{ data: evidence }, { data: parking }] = await Promise.all([
        supabase.from("overtime_evidence").select("storage_path").eq("job_id", jobId),
        supabase.from("parking_receipts").select("storage_path").eq("job_id", jobId),
      ]);
      const { error } = await supabase.from("jobs").delete().eq("id", jobId);
      if (error) throw error;
      // Best-effort file cleanup (the job and its DB records are already gone;
      // a storage hiccup must not report the delete as failed).
      try {
        const evPaths = (evidence || []).map((r) => r.storage_path).filter(Boolean);
        const pkPaths = (parking || []).map((r) => r.storage_path).filter(Boolean);
        if (evPaths.length) await supabase.storage.from("overtime-evidence").remove(evPaths);
        if (pkPaths.length) await supabase.storage.from("parking-receipts").remove(pkPaths);
      } catch { /* orphaned files are harmless */ }
      setInfo(t("history.toasts.deleted"));
      await load();
    } catch (e) {
      setErr(e?.message || t("history.errors.deleteFailed"));
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function submitJob(jobId) {
    const ok = window.confirm(t("history.confirm.submit"));
    if (!ok) return;
    setActionLoadingKey(jobId);
    setErr(""); setInfo("");
    try {
      const { error } = await supabase.from("jobs").update({ status: "submitted", locked: true }).eq("id", jobId);
      if (error) throw error;
      setInfo(t("history.toasts.submitted"));
      await load();
    } catch (e) {
      setErr(e?.message || t("history.errors.submitFailed"));
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function submitDay(dateKey, ids) {
    if (!ids || ids.length === 0) return;
    const ok = window.confirm(t("history.confirm.submitDay", { date: dayjs(dateKey).format("DD MMM YYYY") }));
    if (!ok) return;
    const actionKey = `day:${dateKey}`;
    setActionLoadingKey(actionKey);
    setErr(""); setInfo("");
    try {
      const { error } = await supabase.from("jobs").update({ status: "submitted", locked: true }).in("id", ids);
      if (error) throw error;
      setInfo(t("history.toasts.daySubmitted", { count: ids.length }));
      await load();
    } catch (e) {
      setErr(e?.message || t("history.errors.submitDayFailed"));
    } finally {
      setActionLoadingKey(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-3">
        {loading && (
          <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>
        )}
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300 flex items-center justify-between gap-3">
            <span>{err}</span>
            <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={load}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {info && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {info}
          </div>
        )}

        {!loading && !err && grouped.length === 0 && (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("history.empty")}</CardContent></Card>
        )}

        {!loading && !err && grouped.map((g) => {
          const dayActionKey = `day:${g.date}`;
          const dayBusy = actionLoadingKey === dayActionKey;
          const dayCanSubmit = g.submittableIds.length > 0;

          return (
            <div key={g.date} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-block rounded-full border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {dayjs(g.date).format("DD MMM YYYY")} • <b className="text-foreground">{g.totalHHmm}</b> • <b className="text-foreground">{g.totalKm}</b> km
                </div>
                {dayCanSubmit && (
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    disabled={dayBusy}
                    onClick={() => submitDay(g.date, g.submittableIds)}
                    title={t("history.submitDayTitle")}
                  >
                    {dayBusy ? "…" : t("history.submitDay")}
                  </Button>
                )}
              </div>

              <div className="grid gap-2">
                {g.list.map((j) => {
                  const d1 = makeDayjsFromJob(j.job_date, j.depart);
                  const d2 = makeDayjsFromJob(j.job_date, j.fin);
                  const totalHours = hoursBetween(d1, d2);

                  const totalLabelRaw = formatHours(totalHours);
                  const totalHHmm = toHHmmLabelFromFormatHours(totalLabelRaw);

                  const { clientKm: a, returnKm: r } = getKilometreBreakdown(j);
                  const km = a + r;

                  const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";

                  const showOpen = canOpen(j);
                  const showDelete = canDelete(j);
                  const showSubmit = canSubmit(j);
                  const busy = actionLoadingKey === j.id;

                  return (
                    <Card key={j.id}>
                      <CardContent className="space-y-3 p-4">
                        {/* Header row: OT + status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-sm font-bold">
                            <span>{t("common.otLabel")}: {j.ot}</span>
                            <JobCaptureIcons job={{ ...j, meal_claim_captured: j.meal_claim_captured || mealJobIds.has(j.id) }} />
                          </div>
                          <Badge variant={statusBadgeVariant(j.status)} className="uppercase tracking-wide">
                            {t(`status.${j.status}`)}
                          </Badge>
                        </div>

                        {/* Metric pills + updated time on the same row */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-block rounded-full border bg-muted px-2 py-0.5 text-xs">
                            {t("common.totalShort")}: <b>{totalHHmm}</b>
                          </span>
                          <span className="inline-block rounded-full border bg-muted px-2 py-0.5 text-xs">
                            {t("common.kmShort")}: <b>{km}</b>
                            {r > 0 ? <span className="font-semibold text-muted-foreground"> ({t("common.outboundShort")}: {a} / {t("common.returnShort")}: {r})</span> : null}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {t("history.updated")}: {updatedLabel}
                          </span>
                        </div>

                        {/* Times */}
                        <div className="text-xs text-muted-foreground">
                          {t("history.depart")}: {fmtTimeHHmm(j.depart)} • {t("history.arrival")}: {fmtTimeHHmm(j.arrivee)} • {t("history.end")}: {fmtTimeHHmm(j.fin)}
                        </div>

                        {/* Action buttons */}
                        {(showOpen || showDelete || showSubmit) && (
                          <div className="flex flex-wrap gap-1.5">
                            {showOpen && (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => openJob(j)}>
                                {busy ? "…" : t("history.open")}
                              </Button>
                            )}
                            {showSubmit && (
                              <Button size="sm" variant="success" disabled={busy} onClick={() => submitJob(j.id)}>
                                {busy ? "…" : t("history.submit")}
                              </Button>
                            )}
                            {showDelete && (
                              <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteJob(j.id)}>
                                {busy ? "…" : t("history.delete")}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function ExpenseIcon({ icon: Icon, label, className }) {
  return <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${className}`} title={label} aria-label={label}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>;
}
