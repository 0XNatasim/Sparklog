import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { weekStartSundayD, weekEndingSaturdayD, ccqWeekNumber } from "@/lib/ccq-week";
import { useT } from "@/lib/use-t";
import EmployerContributionsManager from "@/components/EmployerContributionsManager";
import CongesIndemnityManager from "@/components/CongesIndemnityManager";
import { companyDate } from "@/lib/company-time";
import { formatHM } from "@/lib/time";
import { costsByEmployee, weeklyCosts } from "@/lib/employer-cost";
import { loadCostInputs } from "@/lib/employer-cost-data";

const montrealToday = companyDate;

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function CostingDashboard() {
  const t = useT();
  const [period, setPeriod] = useState("week");
  const [weekEnd, setWeekEnd] = useState(() => weekEndingSaturdayD(montrealToday()).format("YYYY-MM-DD"));
  // Rows of the range last loaded; « loading » while the shown range is not the loaded one.
  const [loaded, setLoaded] = useState({ key: "", rows: [], error: "" });
  const [expanded, setExpanded] = useState(new Set());

  // Last 16 CCQ weeks (ending Saturday) for the week picker.
  const weekOptions = useMemo(() => {
    const opts = [];
    let end = weekEndingSaturdayD(montrealToday());
    for (let i = 0; i < 16; i++) {
      opts.push({ key: end.format("YYYY-MM-DD"), start: end.subtract(6, "day"), end, weekNo: ccqWeekNumber(end) });
      end = end.subtract(7, "day");
    }
    return opts;
  }, []);

  const range = useMemo(() => {
    if (period === "week") {
      return { start: weekStartSundayD(weekEnd).format("YYYY-MM-DD"), end: weekEnd }; // CCQ week (dim → sam)
    }
    const end = montrealToday();
    const start = period === "year"
      ? dayjs(end).startOf("year").format("YYYY-MM-DD")
      : dayjs(end).startOf("month").format("YYYY-MM-DD");
    return { start, end };
  }, [period, weekEnd]);

  function toggleRow(id) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Same calculation as the talons, week by week (src/lib/employer-cost.js), added up per employee.
  const rangeKey = `${range.start}|${range.end}`;
  useEffect(() => {
    let cancelled = false;
    loadCostInputs(range)
      .then((inputs) => { if (!cancelled) setLoaded({ key: rangeKey, rows: costsByEmployee(weeklyCosts(inputs), inputs.profiles), error: "" }); })
      .catch((e) => { if (!cancelled) setLoaded({ key: rangeKey, rows: [], error: e?.message || String(e) }); });
    return () => { cancelled = true; };
  }, [range, rangeKey]);
  const loading = loaded.key !== rangeKey;
  const rows = loading ? [] : loaded.rows;
  const error = loading ? "" : loaded.error;

  const totals = rows.reduce((acc, r) => ({
    regHours: acc.regHours + (r.regularMinutes + r.returnNoBenefitMinutes) / 60,
    otHours: acc.otHours + r.overtimeMinutes / 60,
    labor: acc.labor + r.labor,
    conges: acc.conges + r.conges,
    contribTotal: acc.contribTotal + r.contribTotal,
    expenses: acc.expenses + r.expenses,
    total: acc.total + r.total,
  }), { regHours: 0, otHours: 0, labor: 0, conges: 0, contribTotal: 0, expenses: 0, total: 0 });

  const COL_COUNT = 8;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t("costing.estimateLabel")} · {dayjs(range.start).format("DD MMM")} – {dayjs(range.end).format("DD MMM YYYY")}</div>
              <p className="mt-1 text-xs text-muted-foreground">{t("costing.description")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("costing.scopeNote")}</p>
              <p className="mt-1 text-xs font-semibold text-warning">{t("costing.reviewNotice")}</p>
              {error && <p className="mt-1 text-xs text-destructive" role="alert">{t("costing.loadError", { message: error })}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {period === "week" && (
                <select
                  value={weekEnd}
                  onChange={(e) => setWeekEnd(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label={t("costing.selectWeek")}
                >
                  {weekOptions.map((w) => (
                    <option key={w.key} value={w.key}>
                      {t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM YYYY")}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex overflow-hidden rounded-md border">
                {["week", "month", "year"].map((p) => (
                  <Button key={p} type="button" size="sm" variant={period === p ? "default" : "ghost"} className="rounded-none" onClick={() => setPeriod(p)}>
                    {t(`costing.period.${p}`)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <EmployerContributionsManager />
      <CongesIndemnityManager />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">{t("costing.col.employee")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.regHours")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.otHours")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.labor")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.conges")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.contrib")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.expenses")}</th>
                  <th className="px-3 py-2.5 text-right font-medium bg-primary/5">{t("costing.col.total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = expanded.has(r.userId);
                  const isNonCcq = r.category !== "ccq";
                  return (
                    <React.Fragment key={r.userId}>
                      <tr className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">
                          <button type="button" onClick={() => toggleRow(r.userId)} className="mr-1.5 inline-flex items-center align-middle text-muted-foreground hover:text-foreground" aria-label={t("costing.breakdown")} aria-expanded={isOpen}>
                            <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </button>
                          {r.name}
                          {r.premium > 0 && <span className="ml-2 text-xs font-normal text-primary">({t("costing.teamLeader")} +{money(r.premium)}/h)</span>}
                          {!r.hasRate && <span className="ml-2 text-xs font-normal text-warning">({t("costing.noRate")})</span>}
                          {r.fixedPay && <span className="ml-2 text-xs font-normal text-info">({t("costing.fixedPay")})</span>}
                          {isNonCcq && !r.fixedPay && <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400">({t("manager.adminLabel")})</span>}
                          {!isNonCcq && !r.hasLevel && <span className="ml-2 text-xs font-normal text-warning">({t("costing.noLevel")})</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatHM((r.regularMinutes + r.returnNoBenefitMinutes) / 60)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatHM(r.overtimeMinutes / 60)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.labor)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.conges)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.contribTotal)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.expenses)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold bg-primary/5">{money(r.total)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b last:border-0 bg-muted/10">
                          <td colSpan={COL_COUNT} className="px-3 py-3">
                            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                              <Detail label={t("costing.col.labor")} value={money(r.labor)} />
                              <Detail label={t("costing.col.conges")} value={money(r.conges)} />
                              {r.contribLines.map((l) => <Detail key={l.code} label={l.label} value={money(l.amount)} sub />)}
                              <Detail label={t("costing.col.contrib")} value={money(r.contribTotal)} />
                              <Detail label={t("costing.col.km")} value={money(r.km)} />
                              <Detail label={t("costing.col.meals")} value={money(r.meals)} />
                              <Detail label={t("costing.col.parking")} value={money(r.parking)} />
                              <Detail label={t("costing.col.phoneData")} value={money(r.phone)} />
                              <Detail label={t("employees.storage")} value={money(r.storage)} />
                              {r.safety > 0 && <Detail label={t("costing.col.safety")} value={money(r.safety)} />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={COL_COUNT} className="px-3 py-6 text-center text-sm text-muted-foreground">{t("costing.empty")}</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-3 py-2.5">{t("costing.totals")}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatHM(totals.regHours)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatHM(totals.otHours)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.labor)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.conges)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.contribTotal)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.expenses)}</td>
                    <td className="px-3 py-2.5 text-right font-mono bg-primary/5">{money(totals.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value, sub }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${sub ? "pl-3 text-muted-foreground" : "font-medium"}`}>
      <span className="text-xs">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
