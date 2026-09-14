import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { calculatePayrollEntries, calculateCongesIndemnity, congesRatesFromRow } from "@/lib/payroll-calculations";
import { jobCodeKind } from "@/lib/job-code";
import { monthlyReportPeriod } from "@/lib/monthly-report-period";
import { formatHM } from "@/lib/time";
import { useT } from "@/lib/use-t";

dayjs.extend(isoWeek);

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// CCQ level → the per-hour rate column on employer_contributions.
const LEVEL_RATE_KEY = {
  compagnon: "rate_compagnon",
  apprenti_4: "rate_apprenti_4",
  apprenti_3: "rate_apprenti_3",
  apprenti_2: "rate_apprenti_2",
  apprenti_1: "rate_apprenti_1",
};

// CCQ week: Sunday → Saturday, keyed by the ending Saturday.
function ccqWeek(dateStr) {
  const d = dayjs(dateStr);
  const end = d.add((6 - d.day() + 7) % 7, "day");
  return { key: end.format("YYYY-MM-DD"), end, start: end.subtract(6, "day") };
}

// The period a job date belongs to: a CCQ week, or a monthly report period
// (ends the last Saturday of the month). Returns dayjs start/end + a string key.
function periodFor(mode, dateStr) {
  if (mode === "month") {
    const p = monthlyReportPeriod(dateStr);
    return { key: p.key, start: dayjs(p.start), end: dayjs(p.end) };
  }
  return ccqWeek(dateStr);
}

function montrealToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Summary cards for the Testing "Week" and "Month" tabs. `mode` = "week" | "month".
export default function PeriodSummary({ mode = "week" }) {
  const t = useT();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const end = montrealToday();
    const start = mode === "month"
      ? dayjs(end).subtract(6, "month").startOf("month").format("YYYY-MM-DD")
      : dayjs(end).subtract(8, "week").startOf("isoWeek").format("YYYY-MM-DD");
    return { start, end };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = range;
      const [{ data: people }, { data: jobs }, { data: meals }, { data: parking }, { data: contribRows }, { data: congesRow }] = await Promise.all([
        supabase.from("profiles").select("id, role, hourly_rate, km_rate, team_leader_premium, apprentice_level"),
        supabase.from("jobs").select("id, user_id, job_date, ot, depart, fin, km_total, km_aller, km_retour, return_time_minutes, hourly_rate_snapshot, team_leader_premium_snapshot, km_rate_snapshot").gte("job_date", start).lte("job_date", end),
        supabase.from("meal_claims").select("user_id, job_date, amount").gte("job_date", start).lte("job_date", end),
        supabase.from("parking_receipts").select("user_id, job_date, amount").gte("job_date", start).lte("job_date", end),
        supabase.from("employer_contributions").select("*").eq("active", true),
        supabase.from("conges_indemnity_rate").select("*").eq("id", true).maybeSingle(),
      ]);
      if (cancelled) return;

      const contributions = contribRows || [];
      const congesRates = congesRatesFromRow(congesRow);
      const profileById = new Map((people || []).map((p) => [p.id, p]));

      const buckets = new Map();
      const bucket = (dateStr) => {
        const p = periodFor(mode, dateStr);
        if (!buckets.has(p.key)) buckets.set(p.key, { ...p, jobs: [], meals: 0, parking: 0 });
        return buckets.get(p.key);
      };
      (jobs || []).forEach((j) => bucket(j.job_date).jobs.push(j));
      (meals || []).forEach((m) => {
        const prof = profileById.get(m.user_id);
        if (prof?.role !== "admin") bucket(m.job_date).meals += Number(m.amount) || 0; // meals = CCQ supper, not for admin
      });
      (parking || []).forEach((p) => { bucket(p.job_date).parking += Number(p.amount) || 0; });

      const result = [];
      for (const b of buckets.values()) {
        if (b.jobs.length === 0) continue;
        const byUser = new Map();
        b.jobs.forEach((j) => {
          if (!byUser.has(j.user_id)) byUser.set(j.user_id, []);
          byUser.get(j.user_id).push(j);
        });

        let labor = 0, conges = 0, contribTotal = 0, kmCost = 0, workedMin = 0, otJobs = 0;
        for (const [uid, ujobs] of byUser) {
          const profile = profileById.get(uid);
          const isNonCcq = profile?.role === "admin";
          const level = profile?.apprentice_level || null;
          const rateKey = level && !isNonCcq ? LEVEL_RATE_KEY[level] : null;

          let empLabor = 0, empPaidMin = 0;
          calculatePayrollEntries(ujobs).forEach((e) => {
            workedMin += e.regularWorkMinutes + e.overtimeWorkMinutes;
            empPaidMin += e.regularWorkMinutes + e.returnRegularMinutes + e.overtime50Minutes + e.overtime100Minutes;
            if (e.overtimeWorkMinutes > 0) otJobs += 1;
            const jobBase = Number(e.job?.hourly_rate_snapshot ?? profile?.hourly_rate) || 0;
            const jobPremium = Number(e.job?.team_leader_premium_snapshot ?? profile?.team_leader_premium) || 0;
            const jobKmRate = Number(e.job?.km_rate_snapshot ?? profile?.km_rate) || 0;
            empLabor += (jobBase + jobPremium) * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60 + (e.overtime50Minutes / 60) * 1.5 + (e.overtime100Minutes / 60) * 2);
            kmCost += e.totalKm * jobKmRate;
          });
          labor += empLabor;
          conges += isNonCcq ? 0 : calculateCongesIndemnity(empLabor, congesRates).total;
          if (rateKey) {
            const perHour = contributions.reduce((s, c) => s + (Number(c[rateKey]) || 0), 0);
            contribTotal += perHour * (empPaidMin / 60);
          }
        }

        const expenses = kmCost + b.meals + b.parking;
        const title = mode === "month" ? b.end.format("MMMM YYYY") : `${t("manager.weekShort")} ${b.end.isoWeek()}`;
        result.push({
          key: b.key,
          title,
          start: b.start,
          end: b.end,
          activeEmployees: byUser.size,
          totalHours: workedMin / 60,
          otJobs,
          jobJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "project").length,
          adJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "admin").length,
          labor,
          conges,
          contribTotal,
          km: kmCost,
          supper: b.meals,
          parking: b.parking,
          expenses,
          total: labor + conges + contribTotal + expenses,
        });
      }
      result.sort((a, b) => (a.key < b.key ? 1 : -1));
      setPeriods(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range, mode, t]);

  if (!loading && periods.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t(mode === "month" ? "testing.month.empty" : "testing.week.empty")}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("costing.reviewNotice")}</p>
      {periods.map((w) => (
        <Card key={w.key}>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">{w.title}</div>
              <div className="text-sm text-muted-foreground">{w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("testing.week.activeEmployees")} value={w.activeEmployees} />
              <Stat label={t("testing.week.totalHours")} value={formatHM(w.totalHours)} />
              <Stat label={t("testing.week.otJobs")} value={w.otJobs} />
              <Stat label={t("testing.week.jobJobs")} value={w.jobJobs} accent="emerald" />
              <Stat label={t("testing.week.adJobs")} value={w.adJobs} accent="sky" />
              <Stat label={t("testing.week.labor")} value={money(w.labor)} />
              <Stat label={t("testing.week.contributions")} value={money(w.contribTotal)} />
              <Stat label={t("testing.week.km")} value={money(w.km)} />
              <Stat label={t("testing.week.supper")} value={money(w.supper)} />
              <Stat label={t("testing.week.parking")} value={money(w.parking)} />
            </div>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
              <span className="text-muted-foreground">{t("testing.week.indemnity")}: <span className="font-mono">{money(w.conges)}</span></span>
              <span className="font-semibold">{t("testing.week.total")}: <span className="font-mono">{money(w.total)}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }) {
  const tone = accent === "emerald"
    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
    : accent === "sky"
      ? "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40"
      : "bg-muted/30";
  return (
    <div className={`rounded-lg border p-2.5 ${tone}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}
