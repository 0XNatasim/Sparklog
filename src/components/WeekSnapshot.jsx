import React, { useEffect, useState, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { hoursBetween, formatHM } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isOffOn } from "@/lib/timeoff";
import { useT } from "@/lib/use-t";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { weekStartSundayD } from "@/lib/ccq-week";
import { liveRoster, weekCellSummary } from "@/lib/live-crew";

// Compact current-week (Sunday → Saturday) overview: per employee and per day, the total
// time, the number of ORs and a colour for saved (orange) / submitted (green) / missing (red).
export default function WeekSnapshot({ onSelectEmployee, weekOffset = 0 }) {
  const t = useT();
  const [people, setPeople] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = companyDate();
  // weekOffset: 0 = current week, -1 = last week (Sunday → Saturday).
  const weekStart = addCalendarDays(weekStartSundayD(today).format("YYYY-MM-DD"), weekOffset * 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const weekEnd = days[6];
    const [p, j, o] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, is_paused, show_on_boards").order("full_name"),
      supabase.from("jobs").select("id, user_id, status, depart, fin, job_date").gte("job_date", weekStart).lte("job_date", weekEnd),
      supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").lte("start_date", weekEnd).or(`end_date.gte.${weekStart},end_date.is.null`),
    ]);
    if (p.error || j.error) setError((p.error || j.error).message);
    setPeople(p.data || []);
    setJobs(j.data || []);
    setTimeOff(o.data || []);
    setLoading(false);
  }, [days, weekStart]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const byKey = new Map();
    jobs.forEach((job) => {
      const key = `${job.user_id}:${job.job_date}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(job);
    });
    const roster = liveRoster(people, { jobUserIds: new Set(jobs.map((job) => job.user_id)) });
    return roster.map((employee) => {
      const cells = days.map((date) => {
        const dayJobs = byKey.get(`${employee.id}:${date}`) || [];
        const hours = dayJobs.reduce((sum, job) => sum + (hoursBetween(
          job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
          job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
        ) || 0), 0);
        const off = timeOff.some((row) => row.user_id === employee.id && !row.start_time && isOffOn(row, date));
        return { date, hours, off, ...weekCellSummary(dayJobs) };
      });
      return { employee, cells, total: cells.reduce((sum, c) => sum + c.hours, 0) };
    }).sort((a, b) => (a.employee.full_name || a.employee.email || "").localeCompare(b.employee.full_name || b.employee.email || ""));
  }, [people, jobs, timeOff, days]);

  function cellClass(cell) {
    if (cell.status === "submitted") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    if (cell.status === "saved") return "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
    if (cell.off) return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    const weekday = dayjs(cell.date).day();
    if (cell.date < today && weekday >= 1 && weekday <= 5) return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
    return "border-transparent bg-muted/30 text-muted-foreground";
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">
              {t("live.week.title")} · {dayjs(weekStart).format("DD MMM")} → {dayjs(days[6]).format("DD MMM YYYY")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("live.week.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">{t("live.week.legendSaved")}</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{t("live.week.legendSubmitted")}</span>
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400">{t("live.week.legendMissing")}</span>
            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">{t("live.week.legendOff")}</span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-1 text-left font-medium">{t("live.week.employee")}</th>
                {days.map((date) => (
                  <th key={date} className={cn("px-1 font-medium capitalize", date === today && "text-foreground")}>
                    {dayjs(date).format("ddd D")}
                  </th>
                ))}
                <th className="px-1 text-right font-medium">{t("live.week.total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, cells, total }) => (
                <tr key={employee.id}>
                  <td className="max-w-[180px] truncate px-1 text-sm font-semibold">{employee.full_name || employee.email}</td>
                  {cells.map((cell) => (
                    <td key={cell.date} className="p-0">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee?.(employee.id, cell.date)}
                        className={cn("flex w-full flex-col items-center rounded-md border px-1 py-1 leading-tight hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", cellClass(cell))}
                      >
                        {cell.count > 0 ? (
                          <span className="py-1 font-mono text-sm font-semibold">{formatHM(cell.hours)}</span>
                        ) : (
                          <span className="py-1 text-sm">{cell.off ? t("live.week.off") : "—"}</span>
                        )}
                      </button>
                    </td>
                  ))}
                  <td className="px-1 text-right font-mono text-sm font-bold">{formatHM(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
