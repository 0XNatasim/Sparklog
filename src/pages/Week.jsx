import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/en";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween } from "../lib/time";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);
dayjs.locale("en");

function parseJobDate(job_date) {
  if (!job_date) return null;
  const formats = ["YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ssZ", "YYYY-MM-DDTHH:mm:ss.SSSZ", "DD MMM YYYY"];
  for (const f of formats) {
    const d = dayjs(job_date, f, true);
    if (d.isValid()) return d;
  }
  const d = dayjs(job_date);
  return d.isValid() ? d : null;
}

function makeDayTime(job_date, timeStr) {
  const d = parseJobDate(job_date);
  if (!d || !timeStr) return null;
  const t = String(timeStr).slice(0, 5);
  const dt = dayjs(`${d.format("YYYY-MM-DD")}T${t}`);
  return dt.isValid() ? dt : null;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatHoursHM(hoursFloat) {
  const totalMinutes = Math.round((hoursFloat || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function isNonEmptyOT(ot) {
  return String(ot || "").trim().length > 0;
}

export default function Week() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const t = useT();

  const employeeIdParam = searchParams.get("employee");
  const isManagerViewingEmployee = role === "manager" && Boolean(employeeIdParam);
  const effectiveUserId = isManagerViewingEmployee ? employeeIdParam : user?.id;

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [openWeekKey, setOpenWeekKey] = useState(null);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      if (!effectiveUserId) {
        setJobs([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      setErr(e?.message || t("week.errors.failedLoad"));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  const { weekly, dailyByKey } = useMemo(() => {
    const dailyMap = new Map();

    for (const j of jobs) {
      const d = parseJobDate(j.job_date);
      if (!d) continue;

      const dayKey = d.format("YYYY-MM-DD");
      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { date: d, hours: 0, km: 0, otCount: 0, jobCount: 0 });
      }
      const day = dailyMap.get(dayKey);
      day.jobCount += 1;

      const d1 = makeDayTime(j.job_date, j.depart);
      const d2 = makeDayTime(j.job_date, j.fin);
      if (d1 && d2) day.hours += hoursBetween(d1, d2) || 0;

      const kmAller = Number(j.km_aller ?? 0) || 0;
      day.km += kmAller;
      if (isNonEmptyOT(j.ot)) day.otCount += 1;
    }

    const weeklyMap = new Map();
    for (const day of dailyMap.values()) {
      const weekStart = day.date.startOf("isoWeek");
      const weekKey = weekStart.format("YYYY-MM-DD");
      const regular = clamp(day.hours, 0, 8);
      const overtime = Math.max(day.hours - 8, 0);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          start: weekStart,
          end: weekStart.endOf("isoWeek"),
          regularHours: 0,
          overtimeHours: 0,
          totalKm: 0,
          dayKeys: [],
        });
      }
      const w = weeklyMap.get(weekKey);
      w.regularHours += regular;
      w.overtimeHours += overtime;
      w.totalKm += day.km;
      w.dayKeys.push(day.date.format("YYYY-MM-DD"));
    }

    const weeklyArr = Array.from(weeklyMap.values()).map((w) => {
      const ot15 = Math.min(w.overtimeHours, 1);
      const ot20 = Math.max(w.overtimeHours - 1, 0);
      const uniqueDayKeys = Array.from(new Set(w.dayKeys)).sort((a, b) =>
        dayjs(a).isAfter(dayjs(b)) ? -1 : 1
      );
      return {
        ...w,
        ot15,
        ot20,
        totalHours: w.regularHours + w.overtimeHours,
        dayKeys: uniqueDayKeys,
      };
    });

    weeklyArr.sort((a, b) => (a.start.isAfter(b.start) ? -1 : 1));
    return { weekly: weeklyArr, dailyByKey: dailyMap };
  }, [jobs]);

  function toggleWeek(weekKey) {
    setOpenWeekKey((prev) => (prev === weekKey ? null : weekKey));
  }

  return (
    <AppShell>
      <div className="space-y-3">
        {loading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}
        {!loading && !err && weekly.length === 0 && (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("week.empty")}</CardContent></Card>
        )}

        {!loading && !err && weekly.map((w) => {
          const weekKey = w.start.format("YYYY-MM-DD");
          const isOpen = openWeekKey === weekKey;

          return (
            <div key={weekKey} className="space-y-2">
              <Card
                role="button"
                tabIndex={0}
                onClick={() => toggleWeek(weekKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggleWeek(weekKey);
                }}
                className={cn(
                  "cursor-pointer transition-colors",
                  isOpen ? "border-primary/40" : ""
                )}
                title={t("week.openTitle")}
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                    <div className="grid gap-1.5">
                      <div className="flex items-center gap-2 text-xl font-extrabold">
                        {t("week.weekNum", { num: w.start.isoWeek() })}
                        {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}
                      </div>
                      <div className="text-sm">
                        {t("week.total")}: <b>{formatHoursHM(w.totalHours)}</b>
                        <span className="mx-2 text-muted-foreground">•</span>
                        <b>{Math.round(w.totalKm)}</b> km
                      </div>
                    </div>

                    <div className="grid gap-1.5 min-w-[140px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-bold text-muted-foreground">{t("week.regular")}:</span>
                        <span className="font-bold text-lg">{formatHoursHM(w.regularHours)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-bold text-muted-foreground">{t("week.ot15")}:</span>
                        <span className="font-bold text-lg">{formatHoursHM(w.ot15)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-bold text-muted-foreground">{t("week.ot20")}:</span>
                        <span className="font-bold text-lg">{formatHoursHM(w.ot20)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isOpen && (
                <Card>
                  <CardContent className="p-3 grid gap-2">
                    {w.dayKeys.length === 0 && (
                      <div className="text-sm text-muted-foreground p-2">{t("week.noDays")}</div>
                    )}
                    {w.dayKeys.map((dayKey) => {
                      const day = dailyByKey.get(dayKey);
                      if (!day) return null;
                      return (
                        <div
                          key={dayKey}
                          className="flex items-center justify-between gap-3 rounded-md border p-3"
                        >
                          <div className="text-sm font-bold">{day.date.format("DD MMM YYYY")}</div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                              <b>{formatHoursHM(day.hours)}</b>
                            </span>
                            <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                              <b>{Math.round(day.km)}</b> km
                            </span>
                            <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                              {t("week.otCountLabel")}<b>{day.otCount}</b>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
