import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { RefreshCw, TimerReset, Unlock } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { hoursBetween, formatHM } from "@/lib/time";
import { cn, withTimeout } from "@/lib/utils";
import { jobCodeTintClass } from "@/lib/job-code";
import { isOffOn, isExceptionOn } from "@/lib/timeoff";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { activePeopleOnLeave, dayStatus, liveRoster, notSubmittedYesterday } from "@/lib/live-crew";

const REFRESH_MS = 30000;

const montrealDate = companyDate;

const fmtHM = formatHM;

export default function LiveCrew({ onSelectEmployee, targetDate = "", snapshot = false }) {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [jobsByUser, setJobsByUser] = useState(new Map());
  const [onLeaveList, setOnLeaveList] = useState([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [todayDate, setTodayDate] = useState("");
  const [exceptionToday, setExceptionToday] = useState(new Set());
  const [notSubmittedList, setNotSubmittedList] = useState([]); // [{id, name}] not submitted yesterday
  const [yesterdayDate, setYesterdayDate] = useState("");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = targetDate || montrealDate();
    setTodayDate(today);
    const yesterday = dayjs(today).subtract(1, "day").format("YYYY-MM-DD");
    setYesterdayDate(yesterday);
    const [{ data: people }, { data: jobs }, { data: timeOff }, { data: yJobs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, is_paused, show_on_boards").order("full_name"),
      supabase.from("jobs").select("id, user_id, ot, status, depart, fin, job_date, updated_at, overtime_evidence_captured").eq("job_date", today),
      supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").lte("start_date", today).or(`end_date.gte.${yesterday},end_date.is.null`),
      supabase.from("jobs").select("user_id, status").eq("job_date", yesterday),
    ]);
    // Off for the FULL day — a full-day range or a weekly recurrence (e.g. never Fridays).
    // A partial-hours congé (start_time set) still leaves them on the board. Owners, admins,
    // board opt-outs and full-day-off people are hidden unless they enter a job today
    // (see liveRoster).
    const offToday = new Set(
      (timeOff || []).filter((row) => isOffOn(row, today) && !row.start_time).map((row) => row.user_id)
    );
    // Full-day leave YESTERDAY — excluded from "not submitted yesterday" (nothing to submit).
    const offYesterday = new Set(
      (timeOff || []).filter((row) => isOffOn(row, yesterday) && !row.start_time).map((row) => row.user_id)
    );
    // Recap "en congé": everyone with time off applicable today (full day OR partial hours).
    setOnLeaveList(activePeopleOnLeave(people, timeOff, today));
    // Present today despite a recurring rule that would otherwise put them off — flag it so a
    // manager sees at a glance who's an exception to their usual pattern (e.g. in to cover).
    setExceptionToday(new Set((timeOff || []).filter((row) => isExceptionOn(row, today)).map((row) => row.user_id)));
    const activePeople = liveRoster(people, {
      jobUserIds: new Set((jobs || []).map((job) => job.user_id)),
      offUserIds: offToday,
    });
    setNotSubmittedList(
      notSubmittedYesterday(people, { yesterdayJobs: yJobs || [], offUserIds: offYesterday })
        .map((p) => ({ id: p.id, name: p.full_name || p.email || p.id }))
    );
    const map = new Map();
    (jobs || []).forEach((job) => {
      if (!map.has(job.user_id)) map.set(job.user_id, []);
      map.get(job.user_id).push(job);
    });
    // Chronological order within the day (1st job, 2nd, …).
    map.forEach((list) => list.sort((a, b) =>
      String(a.depart || "99").localeCompare(String(b.depart || "99")) || String(a.updated_at).localeCompare(String(b.updated_at))
    ));
    setEmployees(activePeople);
    setJobsByUser(map);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [targetDate]);

  useEffect(() => {
    load();
    if (snapshot) return undefined;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, snapshot]);

  const rows = employees
    .map((employee) => {
      const jobs = jobsByUser.get(employee.id) || [];
      const dayTotal = jobs.reduce((sum, job) => sum + (hoursBetween(
        job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
        job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
      ) || 0), 0);
      return { employee, jobs, dayTotal };
    })
    .sort((a, b) => b.dayTotal - a.dayTotal);

  // Recap: an OT counts once it is saved or submitted (drafts excluded).
  const COUNTED_STATUS = new Set(["saved", "updated", "submitted", "approved"]);
  const countedJobs = (jobs) => jobs.filter((j) => COUNTED_STATUS.has(j.status));
  const withOtCount = rows.filter((r) => countedJobs(r.jobs).length > 0).length;
  const totalOtCount = rows.reduce((n, r) => n + countedJobs(r.jobs).length, 0);
  const over8Count = rows.filter((r) => r.dayTotal > 8).length;

  const notSubmittedCount = notSubmittedList.length;
  const onLeaveCount = onLeaveList.length;
  const recapTiles = [
    { label: t("live.recap.withOt"), value: `${withOtCount}/${employees.length}`, cls: "text-emerald-600 dark:text-emerald-400" },
    { label: t("live.recap.totalOt"), value: totalOtCount, cls: "text-foreground" },
    { label: t("live.recap.over8"), value: over8Count, cls: "text-amber-600 dark:text-amber-400" },
    {
      label: t("live.recap.onLeave"),
      value: onLeaveCount,
      cls: "text-sky-600 dark:text-sky-400",
      onClick: onLeaveCount > 0 ? () => setLeaveOpen(true) : null,
      title: t("live.leave.open"),
    },
    !snapshot && {
      label: t("live.recap.notSubmittedYesterday"),
      value: notSubmittedCount,
      cls: notSubmittedCount > 0 ? "text-destructive dark:text-red-300" : "text-foreground",
      onClick: notSubmittedCount > 0 ? () => { setUnlockMsg(""); setUnlockOpen(true); } : null,
    },
  ].filter(Boolean);

  async function unlockAllYesterday() {
    if (!notSubmittedList.length || !yesterdayDate) return;
    setUnlockBusy(true);
    setUnlockMsg("");
    try {
      const payload = notSubmittedList.map((e) => ({ user_id: e.id, job_date: yesterdayDate, unlocked_until: null }));
      const { error } = await withTimeout(
        supabase.from("job_entry_unlocks").upsert(payload, { onConflict: "user_id,job_date" }),
        12000
      );
      if (error) throw error;
      setUnlockMsg(t("live.unlock.done", { count: payload.length }));
    } catch (e) {
      setUnlockMsg(e?.message || String(e));
    } finally {
      setUnlockBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              {snapshot ? t("live.snapshot.title") : t("live.title")} · {dayjs(todayDate || montrealDate()).format("DD MMM YYYY")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t(snapshot ? "live.snapshot.description" : "live.description")}</p>
          </div>
          {/* Day recap — centered, compact */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
            {recapTiles.map((tile) => (
              tile.onClick ? (
                <button key={tile.label} type="button" onClick={tile.onClick} title={tile.title || t("live.unlock.open")} className="rounded px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className={`text-base font-bold leading-tight tabular-nums underline decoration-dotted underline-offset-2 ${tile.cls}`}>{tile.value}</div>
                  <div className="text-[10px] leading-tight text-muted-foreground">{tile.label}</div>
                </button>
              ) : (
                <div key={tile.label} className="px-1">
                  <div className={`text-base font-bold leading-tight tabular-nums ${tile.cls}`}>{tile.value}</div>
                  <div className="text-[10px] leading-tight text-muted-foreground">{tile.label}</div>
                </div>
              )
            ))}
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && <span className="text-xs text-muted-foreground">{t("live.updated", { time: dayjs(updatedAt).format("HH:mm:ss") })}</span>}
            {!snapshot && (
              <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("live.refresh")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows
          .map(({ employee, jobs, dayTotal }) => {
            const overtime = dayTotal > 8;
            const overtimeCaptured = jobs.some((job) => job.overtime_evidence_captured);
            const status = dayStatus(jobs);
            return (
            <Card
              key={employee.id}
              title={status === "submitted" ? t("live.daySubmitted") : status === "saved" ? t("live.dayNotSubmitted") : undefined}
            >
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    <button
                      type="button"
                      onClick={() => onSelectEmployee?.(employee.id, todayDate)}
                      className={cn(
                        "truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        status === "submitted" && "text-emerald-600 dark:text-emerald-400",
                        status === "saved" && "text-amber-600 dark:text-amber-400",
                        status === "none" && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {employee.full_name || employee.email}
                    </button>
                    {overtime && (
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          overtimeCaptured ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-red-500/15 text-red-600 dark:text-red-400",
                        )}
                        title={overtimeCaptured ? t("live.overtimeTooltip") : t("live.overtimeMissingTooltip")}
                        aria-label={overtimeCaptured ? t("live.overtimeTooltip") : t("live.overtimeMissingTooltip")}
                      >
                        <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                    {exceptionToday.has(employee.id) && (
                      <span title={t("live.exceptionTooltip")} className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                        {t("live.exceptionBadge")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("live.jobsCount", { count: jobs.length })}</span>
                </div>
                {jobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("live.noJobs")}</p>
                ) : (
                  <div className="space-y-1">
                    {jobs.map((job, index) => (
                      <div key={job.id} className={cn("flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm", jobCodeTintClass(job.ot))}>
                        <span className="flex items-center gap-2 truncate">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
                          <span className="truncate">{job.ot || "—"}</span>
                        </span>
                        <span className="shrink-0 font-mono font-semibold">{fmtHM(hoursBetween(
                          job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
                          job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
                        ))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-1 pt-0.5 text-xs">
                      <span className="text-muted-foreground">{t("live.dayTotal")}</span>
                      <span className={cn("font-mono font-bold", overtime && "text-amber-600 dark:text-amber-400")}>{fmtHM(dayTotal)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
      </div>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("live.leave.title", { date: todayDate ? dayjs(todayDate).format("DD MMM YYYY") : "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("live.leave.hint")}</p>
          <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {onLeaveList.map((employee) => (
              <div key={employee.id} className="px-3 py-2 text-sm">{employee.name}</div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("live.unlock.title", { date: yesterdayDate ? dayjs(yesterdayDate).format("DD MMM YYYY") : "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("live.unlock.hint")}</p>

          {notSubmittedList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("live.unlock.none")}</p>
          ) : (
            <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {notSubmittedList.map((e) => (
                <div key={e.id} className="px-3 py-2 text-sm">{e.name}</div>
              ))}
            </div>
          )}

          {unlockMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{unlockMsg}</p>}

          <DialogFooter>
            <Button type="button" disabled={unlockBusy || notSubmittedList.length === 0} onClick={unlockAllYesterday}>
              <Unlock className="mr-1.5 h-4 w-4" />{unlockBusy ? t("common.working") : t("live.unlock.unlockAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
