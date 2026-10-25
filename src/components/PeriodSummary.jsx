import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { Card, CardContent } from "@/components/ui/card";
import { monthlyReportPeriod } from "@/lib/monthly-report-period";
import { formatHM } from "@/lib/time";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { weeklyCosts } from "@/lib/employer-cost";
import { ccqWeek, periodsFromWeeklyCosts } from "@/lib/period-costs";
import { loadCostInputs } from "@/lib/employer-cost-data";

dayjs.extend(isoWeek);

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const montrealToday = companyDate;

// Summary cards for the Testing "Week" and "Month" tabs. `mode` = "week" | "month".
export default function PeriodSummary({ mode = "week" }) {
  const t = useT();
  // Whole CCQ weeks / whole monthly periods: the last 9 weeks, or the last 7 monthly periods.
  const range = useMemo(() => {
    const end = montrealToday();
    const first = mode === "month"
      ? monthlyReportPeriod(dayjs(end).subtract(6, "month").format("YYYY-MM-DD")).start
      : ccqWeek(dayjs(end).subtract(8, "week").format("YYYY-MM-DD")).start.format("YYYY-MM-DD");
    return { start: first, end };
  }, [mode]);
  const rangeKey = `${mode}|${range.start}|${range.end}`;
  const [loaded, setLoaded] = useState({ key: "", periods: [], error: "" });

  useEffect(() => {
    let cancelled = false;
    loadCostInputs(range)
      .then((inputs) => { if (!cancelled) setLoaded({ key: rangeKey, periods: periodsFromWeeklyCosts(weeklyCosts(inputs), mode, t), error: "" }); })
      .catch((e) => { if (!cancelled) setLoaded({ key: rangeKey, periods: [], error: e?.message || String(e) }); });
    return () => { cancelled = true; };
  }, [range, rangeKey, mode, t]);
  const loading = loaded.key !== rangeKey;
  const periods = loading ? [] : loaded.periods;

  if (!loading && loaded.error) {
    return <Card><CardContent className="p-6 text-sm text-destructive" role="alert">{t("costing.loadError", { message: loaded.error })}</CardContent></Card>;
  }

  if (!loading && periods.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t(mode === "month" ? "testing.month.empty" : "testing.week.empty")}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-warning">{t("costing.reviewNotice")}</p>
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
              <Stat label={t("testing.week.phoneData")} value={money(w.phone)} />
              <Stat label={t("employees.storage")} value={money(w.storage)} />
              {w.safety > 0 && <Stat label={t("costing.col.safety")} value={money(w.safety)} />}
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
    ? "border-success/30 bg-success/10"
    : accent === "sky"
      ? "border-info/30 bg-info/10"
      : "bg-muted/30";
  return (
    <div className={`rounded-lg border p-2.5 ${tone}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}
