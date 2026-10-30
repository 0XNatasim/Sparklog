import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { calculateDailyTotals, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-t";
import { useHolidayDates } from "@/lib/company-holidays";
import { formatRoundingMinutes, loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { isSubcontractorRole } from "@/lib/roles";
import WeeklyReportButton from "@/components/WeeklyReportButton";

const isNonEmptyOT = (ot) => String(ot || "").trim().length > 0;
function fmtHM(hoursFloat) {
  const m = Math.round((hoursFloat || 0) * 60);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
function ccqWeekOf(dateStr) {
  const end = weekEndingSaturdayD(dateStr);
  return { key: end.format("YYYY-MM-DD"), start: weekStartSundayD(dateStr), end };
}

// ── Vue semaine (Testing) ────────────────────────────────────────────────────
// For a selected CCQ week, one card per employee with their weekly recap (same as the
// employee "Semaine" tab), clickable to expand the day breakdown. Two columns.
export default function WeekViewTab() {
  const t = useT();
  const holidayDates = useHolidayDates();
  const [employees, setEmployees] = useState([]);
  const [jobsByEmp, setJobsByEmp] = useState(new Map());
  const [roundingByEmp, setRoundingByEmp] = useState(new Map());
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = dayjs().subtract(16, "week").format("YYYY-MM-DD");
        const [{ data: profs, error: pErr }, { data: jobs, error: jErr }, rounding] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid").order("full_name", { ascending: true }),
          fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, depart, arrivee, fin, ot, km_total, km_aller, km_retour, return_time_minutes").gte("job_date", since).order("id")),
          loadDayRounding(),
        ]);
        if (pErr) throw pErr;
        if (jErr) throw jErr;
        if (cancelled) return;
        setEmployees(profs || []);
        const jByE = new Map();
        const weekMap = new Map();
        (jobs || []).forEach((j) => {
          if (!jByE.has(j.user_id)) jByE.set(j.user_id, []);
          jByE.get(j.user_id).push(j);
          const w = ccqWeekOf(j.job_date);
          if (!weekMap.has(w.key)) weekMap.set(w.key, { ...w, weekNo: ccqWeekNumber(w.end) });
        });
        setJobsByEmp(jByE);
        setRoundingByEmp(rounding);
        const wk = [...weekMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
        setWeeks(wk);
        setSelectedWeek(wk[0]?.key || "");
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const week = useMemo(() => weeks.find((w) => w.key === selectedWeek) || null, [weeks, selectedWeek]);

  // Per-employee weekly recap for the selected week (only employees with jobs that week).
  const cards = useMemo(() => {
    if (!week) return [];
    const out = [];
    for (const profile of employees) {
      const jobs = (jobsByEmp.get(profile.id) || []).filter((j) => ccqWeekOf(j.job_date).key === week.key);
      if (!jobs.length) continue;
      const rounding = roundingFor(roundingByEmp, profile.id);
      const daily = calculateDailyTotals(jobs, { ...overtimeOptionsFromProfile(profile), holidayDates, rounding });
      const days = [...daily.entries()].map(([dayKey, d]) => ({
        dayKey,
        date: dayjs(dayKey),
        hours: d.totalPaidMinutes / 60,
        km: d.totalKm,
        otCount: jobs.filter((j) => j.job_date === dayKey && isNonEmptyOT(j.ot)).length,
        rounding: d.roundingMinutes,
        counter: rounding.balanceAfter(dayKey),
      })).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
      const acc = { regularHours: 0, ot15: 0, ot20: 0, returnNb: 0, km: 0 };
      for (const d of daily.values()) {
        acc.regularHours += (d.regularWorkMinutes + d.returnRegularMinutes) / 60;
        acc.ot15 += d.overtime50Minutes / 60;
        acc.ot20 += d.overtime100Minutes / 60;
        acc.returnNb += d.returnNoBenefitMinutes / 60;
        acc.km += d.totalKm;
      }
      out.push({ profile, days, ...acc, totalHours: acc.regularHours + acc.ot15 + acc.ot20 + acc.returnNb, counter: rounding.balanceAfter(week.end.format("YYYY-MM-DD")) });
    }
    return out;
  }, [week, employees, jobsByEmp, holidayDates, roundingByEmp]);

  const subcontractors = cards.filter((c) => isSubcontractorRole(c.profile.role));

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block w-full text-xs sm:max-w-sm">
              <span className="text-muted-foreground">{t("payroll.weekSelect")}</span>
              <select value={selectedWeek} onChange={(e) => { setSelectedWeek(e.target.value); setOpenId(null); }} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                {weeks.map((w) => (
                  <option key={w.key} value={w.key}>{t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM YYYY")}</option>
                ))}
                {weeks.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
              </select>
            </label>
            <WeeklyReportButton week={week} />
          </div>
          {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
          {loading && <div className="mt-3 text-xs text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {!loading && week && cards.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("week.empty")}</CardContent></Card>
      )}

      {subcontractors.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="font-semibold">{t("week.subcontractors")}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 font-medium">{t("live.week.employee")}</th>
                    <th className="py-1 text-right font-medium">{t("week.regular")}</th>
                    <th className="py-1 text-right font-medium">{t("week.ot15")}</th>
                    <th className="py-1 text-right font-medium">{t("week.ot20")}</th>
                    <th className="py-1 text-right font-medium">{t("week.return")}</th>
                    <th className="py-1 text-right font-medium">{t("week.total")}</th>
                    <th className="py-1 text-right font-medium">km</th>
                  </tr>
                </thead>
                <tbody>
                  {subcontractors.map((c) => (
                    <tr key={c.profile.id} className="border-t">
                      <td className="py-1 font-semibold">{c.profile.full_name || c.profile.id}</td>
                      <td className="py-1 text-right font-mono">{fmtHM(c.regularHours)}</td>
                      <td className="py-1 text-right font-mono">{fmtHM(c.ot15)}</td>
                      <td className="py-1 text-right font-mono">{fmtHM(c.ot20)}</td>
                      <td className="py-1 text-right font-mono">{fmtHM(c.returnNb)}</td>
                      <td className="py-1 text-right font-mono font-bold">{fmtHM(c.totalHours)}</td>
                      <td className="py-1 text-right font-mono">{Math.round(c.km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map(({ profile, days, ...w }) => {
          const isOpen = openId === profile.id;
          return (
            <div key={profile.id} className="space-y-2">
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setOpenId((p) => (p === profile.id ? null : profile.id))}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenId((p) => (p === profile.id ? null : profile.id)); }}
                className={cn("cursor-pointer transition-colors", isOpen ? "border-primary/40" : "")}
              >
                <CardContent className="p-4">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                    <div className="grid gap-1">
                      <div className="flex items-center gap-2 font-bold">
                        {profile.full_name || profile.id}
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="text-sm">
                        {t("week.total")}: <b>{fmtHM(w.totalHours)}</b>
                        <span className="mx-2 text-muted-foreground">•</span>
                        <b>{Math.round(w.km)}</b> km
                      </div>
                      <div className="text-xs text-muted-foreground">{t("rounding.counter")}: <b className="font-mono">{formatRoundingMinutes(w.counter)}</b></div>
                    </div>
                    <div className="grid gap-0.5 text-sm min-w-[130px]">
                      <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{t("week.regular")}:</span><b>{fmtHM(w.regularHours)}</b></div>
                      <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{t("week.ot15")}:</span><b>{fmtHM(w.ot15)}</b></div>
                      <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{t("week.ot20")}:</span><b>{fmtHM(w.ot20)}</b></div>
                      {w.returnNb > 0 && <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{t(isSubcontractorRole(profile.role) ? "week.return" : "week.returnNoBenefit")}:</span><b>{fmtHM(w.returnNb)}</b></div>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isOpen && (
                <Card>
                  <CardContent className="grid gap-2 p-3">
                    {days.length === 0 && <div className="p-2 text-sm text-muted-foreground">{t("week.noDays")}</div>}
                    {days.map((d) => (
                      <div key={d.dayKey} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="text-sm font-bold">{d.date.format("DD MMM YYYY")}</div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs"><b>{fmtHM(d.hours)}</b></span>
                          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs"><b>{Math.round(d.km)}</b> km</span>
                          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">{t("week.otCountLabel")}<b>{d.otCount}</b></span>
                          {d.rounding !== 0 && <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs" title={t("rounding.help")}>{t("rounding.dayChip", { minutes: formatRoundingMinutes(d.rounding), counter: formatRoundingMinutes(d.counter) })}</span>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
