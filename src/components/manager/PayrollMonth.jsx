import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useSearchParams } from "react-router-dom";
import { Download, FileJson, Percent } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Fold from "@/components/ui/fold";
import CcqJsonExport from "@/components/CcqJsonExport";
import DasTab from "@/components/DasTab";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { companyDate } from "@/lib/company-time";
import { ccqWeekNumber } from "@/lib/ccq-week";
import { monthWeekEnds, payrollMonthCsv, planPayrollMonth, weekBounds } from "@/lib/payroll-week";
import { loadPayrollData, planArgs } from "@/lib/payroll-data";

// Messier Connexion's first payroll month: nothing to show before it.
const FIRST_MONTH = "2026-04";

const money = (v) => `${(Number(v) || 0).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const hours = (v) => {
  const m = Math.round((Number(v) || 0) * 60);
  return m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : "—";
};

// Gestion V3 › Paie et coûts › Mois: the month's CCQ weeks (by their Saturday, as the CCQ monthly
// report) summed per employee from the week calculation — hours by rate, gross, employer cost and
// DAS in one table — then the CCQ monthly report and the DAS by pay date, in the same place.
export default function PayrollMonth({ messier = false }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const thisMonth = companyDate().slice(0, 7);
  const lastMonth = dayjs(`${thisMonth}-01`).subtract(1, "month").format("YYYY-MM");
  const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : lastMonth;
  const monthOptions = useMemo(() => {
    const list = [];
    for (let m = dayjs(`${thisMonth}-01`); m.format("YYYY-MM") >= FIRST_MONTH; m = m.subtract(1, "month")) list.push(m.format("YYYY-MM"));
    if (!list.includes(month)) list.push(month);
    return list;
  }, [thisMonth, month]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const weekEnds = useMemo(() => monthWeekEnds(month), [month]);

  const load = useCallback(async () => {
    try {
      const start = weekBounds(weekEnds[0]).start;
      const end = weekEnds[weekEnds.length - 1];
      const loaded = await loadPayrollData(supabase, { start, end });
      setErr("");
      setData({ ...loaded, month });
    } catch (e) {
      setErr(e?.message || t("payMonth.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [weekEnds, month, t]);

  // load() sets state only after its first await.
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const plan = useMemo(() => {
    if (!data || data.month !== month) return null;
    return planPayrollMonth({ month, ...planArgs(data, { messier }) });
  }, [data, month, messier]);

  function setMonth(value) {
    const next = new URLSearchParams(params);
    if (value === lastMonth) next.delete("month"); else next.set("month", value);
    setParams(next, { replace: true });
    setLoading(true);
  }

  function exportCsv() {
    const header = [
      t("payWeek.csv.employeeNumber"), t("payroll.employee"), t("payMonth.col.weeks"),
      t("payWeek.csv.regular"), t("payWeek.csv.ot150"), t("payWeek.csv.ot200"), t("payWeek.csv.return"), t("payWeek.csv.total"),
      t("payWeek.csv.km"), t("payWeek.csv.meals"), t("payWeek.csv.parking"), t("payWeek.col.gross"), t("payWeek.col.cost"),
    ];
    const blob = new Blob([payrollMonthCsv(plan, { header })], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Heures_mois_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const firstWeek = ccqWeekNumber(dayjs(weekEnds[0]));
  const lastWeek = ccqWeekNumber(dayjs(weekEnds[weekEnds.length - 1]));
  const num = "whitespace-nowrap px-2 py-2 text-right font-mono";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("mgr.nav.payrollMonth")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("payMonth.weeks", { first: firstWeek, last: lastWeek, start: dayjs(weekBounds(weekEnds[0]).start).format("D MMM"), end: dayjs(weekEnds[weekEnds.length - 1]).format("D MMM") })}
          </p>
        </div>
        <label className="flex w-full flex-col gap-1 text-xs font-semibold text-muted-foreground sm:w-auto">
          {t("payMonth.monthLabel")}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="min-h-10 w-full rounded-md border border-input bg-background px-2 text-sm font-medium capitalize text-foreground sm:min-w-[14rem]"
          >
            {monthOptions.map((m) => <option key={m} value={m}>{dayjs(`${m}-01`).format("MMMM YYYY")}</option>)}
          </select>
        </label>
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      {loading && <div className="text-sm text-muted-foreground">{t("common.working")}</div>}

      {plan && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: t("payWeek.tile.hours"), value: hours(plan.totals.hours) },
              { label: t("payWeek.tile.gross"), value: money(plan.totals.gross) },
              { label: t("payWeek.tile.cost"), value: money(plan.totals.employerCost), strong: true },
              { label: t("payWeek.tile.das"), value: money(plan.totals.das) },
            ].map((tile) => (
              <Card key={tile.label} className={cn(tile.strong && "border-primary/40")}><CardContent className="p-4">
                <div className="text-xs font-semibold text-muted-foreground">{tile.label}</div>
                <div className={cn("mt-1 font-mono text-xl", tile.strong && "font-bold text-primary")}>{tile.value}</div>
              </CardContent></Card>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("payWeek.tile.note", { count: plan.totals.employees })}
            {plan.pendingEmployees > 0 && <> {t("payWeek.tile.pending", { count: plan.pendingEmployees })}</>}
          </p>

          <Card><CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{t("payMonth.byEmployee")}</h3>
              <Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal py-2" disabled={!plan.rows.length} onClick={exportCsv}>
                <Download className="mr-1.5 h-4 w-4" /> {t("payWeek.exportHours")}
              </Button>
            </div>
            {plan.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("payMonth.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-2 font-medium">{t("payroll.employee")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payMonth.col.weeks")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.regular")}</th>
                      <th className="px-2 py-2 text-right font-medium">1,5×</th>
                      <th className="px-2 py-2 text-right font-medium">2×</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.return")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.gross")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.cost")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.das")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row) => (
                      <tr key={row.profile.id} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium">
                          {row.profile.full_name}
                          {row.pending && <span className="ml-2 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">{t("payMonth.pending")}</span>}
                        </td>
                        <td className={num}>{row.weeks}</td>
                        <td className={num}>{hours(row.regularHours)}</td>
                        <td className={num}>{hours(row.ot150Hours)}</td>
                        <td className={num}>{hours(row.ot200Hours)}</td>
                        <td className={num}>{hours(row.returnNbHours)}</td>
                        <td className={num}>{money(row.gross)}</td>
                        <td className={cn(num, "font-semibold")}>{money(row.employerCost)}</td>
                        <td className={num}>{money(row.das)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="px-2 py-2">{t("payroll.das.total")}</td>
                      <td />
                      <td className={num}>{hours(plan.totals.regularHours)}</td>
                      <td className={num}>{hours(plan.totals.ot150Hours)}</td>
                      <td className={num}>{hours(plan.totals.ot200Hours)}</td>
                      <td className={num}>{hours(plan.totals.returnNbHours)}</td>
                      <td className={num}>{money(plan.totals.gross)}</td>
                      <td className={num}>{money(plan.totals.employerCost)}</td>
                      <td className={num}>{money(plan.totals.das)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("payMonth.note")} {t("payWeek.costNote")}</p>
          </CardContent></Card>

          <Fold icon={FileJson} title={t("payMonth.ccqTitle", { month: dayjs(`${month}-01`).format("MMMM YYYY") })}>
            <CcqJsonExport key={month} defaultMonth={month} />
          </Fold>
          <Fold icon={Percent} title={t("payMonth.dasTitle")}>
            <p className="mb-3 text-xs text-muted-foreground">{t("payMonth.dasIntro")}</p>
            <DasTab messier={messier} />
          </Fold>
          <p className="text-xs text-muted-foreground">{t("payWeek.disclaimer")}</p>
        </>
      )}
    </div>
  );
}
