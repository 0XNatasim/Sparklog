import React, { useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { hoursBetween, formatHM } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isOffOn } from "@/lib/timeoff";
import { useHolidayDates } from "@/lib/company-holidays";
import { useT } from "@/lib/use-t";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { weekStartSundayD } from "@/lib/ccq-week";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";
import { loadDayRounding, roundingFor, weekRoundingSummary } from "@/lib/day-rounding";
import { liveRoster, notStartedOn, weekCellSummary } from "@/lib/live-crew";

// Compact current-week (Sunday → Saturday) overview: per employee and per day, the total
// time, the number of ORs and a colour for saved (orange) / submitted (green) / missing (red).
// +7 / −7 (minutes; the unit is in the legend and the tooltip).
const signed = (minutes) => `${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${Math.abs(Math.round(minutes))}`;

export default function WeekSnapshot({ onSelectEmployee, weekOffset = 0 }) {
  const t = useT();
  const [people, setPeople] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [rounding, setRounding] = useState(new Map());
  const [loadedWeek, setLoadedWeek] = useState(null); // week the rows shown belong to
  const [error, setError] = useState("");

  const today = companyDate();
  // CCQ non-worked days (jours fériés chômés, construction vacation): nobody is expected to work.
  const holidayDates = useHolidayDates();
  const holidays = useMemo(() => new Set(holidayDates), [holidayDates]);
  // weekOffset: 0 = current week, -1 = last week (Sunday → Saturday).
  const weekStart = addCalendarDays(weekStartSundayD(today).format("YYYY-MM-DD"), weekOffset * 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)), [weekStart]);
  const loading = loadedWeek !== weekStart;

  useEffect(() => {
    let alive = true;
    const weekEnd = days[6];
    Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, is_paused, show_on_boards, start_date").order("full_name"),
      supabase.from("jobs").select("id, user_id, status, depart, fin, job_date, km_total, km_aller, km_retour").gte("job_date", weekStart).lte("job_date", weekEnd),
      supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").lte("start_date", weekEnd).or(`end_date.gte.${weekStart},end_date.is.null`),
      // The rounding counters (15 min per day): without them the squares still show, only the paid line is missing.
      loadDayRounding({ untilDate: weekEnd }).catch(() => new Map()),
    ]).then(([p, j, o, r]) => {
      if (!alive) return;
      setError(p.error || j.error ? (p.error || j.error).message : "");
      setPeople(p.data || []);
      setJobs(j.data || []);
      setTimeOff(o.data || []);
      setRounding(r);
      setLoadedWeek(weekStart);
    });
    return () => { alive = false; };
  }, [days, weekStart]);

  const rows = useMemo(() => {
    const byKey = new Map();
    jobs.forEach((job) => {
      const key = `${job.user_id}:${job.job_date}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(job);
    });
    // A new hire whose first day of work is after this week is not listed (0110).
    const roster = liveRoster(people, { jobUserIds: new Set(jobs.map((job) => job.user_id)), date: days[6] });
    return roster.map((employee) => {
      const cells = days.map((date) => {
        const dayJobs = byKey.get(`${employee.id}:${date}`) || [];
        const hours = dayJobs.reduce((sum, job) => sum + (hoursBetween(
          job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
          job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
        ) || 0), 0);
        const km = dayJobs.reduce((sum, job) => sum + getKilometreBreakdown(job).totalKm, 0);
        const off = timeOff.some((row) => row.user_id === employee.id && !row.start_time && isOffOn(row, date));
        return {
          date, hours, km, off, holiday: holidays.has(date),
          // Days before the first day of work: nothing was expected (never « Rien d'entré »).
          notStarted: notStartedOn(employee, date),
          firstDay: employee.start_date === date,
          ...weekCellSummary(dayJobs),
        };
      });
      return {
        employee, cells, total: cells.reduce((sum, c) => sum + c.hours, 0), totalKm: cells.reduce((sum, c) => sum + c.km, 0),
        round: weekRoundingSummary(roundingFor(rounding, employee.id), weekStart, days[6]),
        hasDraft: cells.some((c) => c.status === "saved"),
      };
    }).sort((a, b) => (a.employee.full_name || a.employee.email || "").localeCompare(b.employee.full_name || b.employee.email || ""));
  }, [people, jobs, timeOff, days, holidays, rounding, weekStart]);

  // Saturday and Sunday only when somebody has a day on them (a quiet weekend takes no room).
  const visibleDays = useMemo(() => days.filter((date) => {
    const weekday = dayjs(date).day();
    return (weekday >= 1 && weekday <= 5) || rows.some((row) => row.cells.some((cell) => cell.date === date && cell.count > 0));
  }), [days, rows]);

  function cellClass(cell) {
    if (cell.status === "submitted") return "border-success/40 bg-success/15 text-success";
    if (cell.status === "saved") return "border-warning/40 bg-warning/15 text-warning";
    if (cell.off) return "border-info/30 bg-info/10 text-info";
    if (cell.notStarted) return "border-transparent bg-muted/30 text-muted-foreground";
    // A holiday is shown like a weekend: never « Rien d'entré ».
    if (cell.holiday) return "border-transparent bg-muted/30 text-muted-foreground";
    const weekday = dayjs(cell.date).day();
    if (cell.date < today && weekday >= 1 && weekday <= 5) return "border-destructive/40 bg-destructive/10 text-destructive";
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
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{t("live.week.legendSaved")}</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">{t("live.week.legendSubmitted")}</span>
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{t("live.week.legendMissing")}</span>
            <span className="rounded-full bg-info/10 px-2 py-0.5 text-info">{t("live.week.legendOff")}</span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows.some((row) => row.round.days > 0) && <p className="text-xs text-muted-foreground">{t("rounding.week.note")}</p>}
        {loading && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-1 text-left font-medium">{t("live.week.employee")}</th>
                {visibleDays.map((date) => (
                  <th key={date} className={cn("px-1 font-medium capitalize", date === today && "text-foreground")}>
                    {dayjs(date).format("ddd D")}
                    {holidays.has(date) && <div className="text-xs font-normal normal-case">{t("live.week.holiday")}</div>}
                  </th>
                ))}
                <th className="px-1 text-right font-medium">{t("live.week.total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, cells, total, totalKm, round, hasDraft }) => (
                <tr key={employee.id}>
                  <td className="max-w-[180px] truncate px-1 text-sm font-semibold">{employee.full_name || employee.email}</td>
                  {cells.filter((cell) => visibleDays.includes(cell.date)).map((cell) => (
                    <td key={cell.date} className="p-0">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee?.(employee.id, cell.date)}
                        className={cn("flex min-h-8 w-full flex-wrap items-center justify-center gap-x-1.5 rounded-md border px-1 py-0.5 leading-tight hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", cellClass(cell))}
                      >
                        {cell.count > 0 ? (
                          <>
                            <span className="font-mono text-sm font-semibold">{formatHM(cell.hours)}</span>
                            <span className="text-[11px] opacity-80">{Math.round(cell.km)} km</span>
                          </>
                        ) : (
                          <span className="text-sm">{cell.off ? t("live.week.off") : cell.holiday ? t("live.week.holiday") : cell.firstDay ? t("live.week.firstDay") : "—"}</span>
                        )}
                      </button>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-1 text-right">
                    <span className="font-mono text-sm font-bold">{formatHM(total)}</span>
                    <span className="ms-1 text-[11px] text-muted-foreground">{Math.round(totalKm)} km</span>
                    {round.days > 0 && (
                      <div className="text-[11px] leading-tight text-muted-foreground" title={t("rounding.help")}>
                        {t("rounding.week.paid", { time: formatHM(round.paid / 60) })}{hasDraft ? "*" : ""} · {t("rounding.week.line", { delta: signed(round.delta), counter: signed(round.counter) })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
