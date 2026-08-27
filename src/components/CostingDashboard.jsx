import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculatePayrollEntries } from "@/lib/payroll-calculations";
import { useT } from "@/lib/use-t";

dayjs.extend(isoWeek);

function montrealToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const hours = (minutes) => (minutes / 60).toFixed(2);

export default function CostingDashboard() {
  const t = useT();
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    const end = montrealToday();
    const start = period === "week"
      ? dayjs(end).startOf("isoWeek").format("YYYY-MM-DD")
      : dayjs(end).startOf("month").format("YYYY-MM-DD");
    return { start, end };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = range;
      const [{ data: people }, { data: jobs }, { data: meals }, { data: parking }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, hourly_rate, km_rate"),
        supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes").gte("job_date", start).lte("job_date", end),
        supabase.from("meal_claims").select("user_id, amount").gte("job_date", start).lte("job_date", end),
        supabase.from("parking_receipts").select("user_id, amount").gte("job_date", start).lte("job_date", end),
      ]);
      if (cancelled) return;

      const profileById = new Map((people || []).map((p) => [p.id, p]));
      const jobsByUser = new Map();
      (jobs || []).forEach((job) => {
        if (!jobsByUser.has(job.user_id)) jobsByUser.set(job.user_id, []);
        jobsByUser.get(job.user_id).push(job);
      });
      const mealByUser = new Map();
      (meals || []).forEach((m) => mealByUser.set(m.user_id, (mealByUser.get(m.user_id) || 0) + (Number(m.amount) || 0)));
      const parkingByUser = new Map();
      (parking || []).forEach((p) => parkingByUser.set(p.user_id, (parkingByUser.get(p.user_id) || 0) + (Number(p.amount) || 0)));

      const userIds = new Set([...jobsByUser.keys(), ...mealByUser.keys(), ...parkingByUser.keys()]);
      const result = [];
      userIds.forEach((userId) => {
        const profile = profileById.get(userId);
        const rate = Number(profile?.hourly_rate) || 0;
        const kmRate = Number(profile?.km_rate) || 0;

        let regMin = 0, ot50Min = 0, ot100Min = 0, returnMin = 0, totalKm = 0;
        const entries = calculatePayrollEntries(jobsByUser.get(userId) || []);
        entries.forEach((e) => {
          regMin += e.regularWorkMinutes;
          ot50Min += e.overtime50Minutes;
          ot100Min += e.overtime100Minutes;
          returnMin += e.returnRegularMinutes;
          totalKm += e.totalKm;
        });

        const labor = rate * ((regMin + returnMin) / 60 + (ot50Min / 60) * 1.5 + (ot100Min / 60) * 2);
        const kmCost = totalKm * kmRate;
        const mealsCost = mealByUser.get(userId) || 0;
        const parkingCost = parkingByUser.get(userId) || 0;

        result.push({
          userId,
          name: profile?.full_name || profile?.email || String(userId).slice(0, 8),
          hasRate: rate > 0,
          regHours: (regMin + returnMin) / 60,
          otHours: (ot50Min + ot100Min) / 60,
          labor, kmCost, mealsCost, parkingCost,
          total: labor + kmCost + mealsCost + parkingCost,
        });
      });
      result.sort((a, b) => b.total - a.total);
      setRows(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const totals = rows.reduce((acc, r) => ({
    regHours: acc.regHours + r.regHours,
    otHours: acc.otHours + r.otHours,
    labor: acc.labor + r.labor,
    kmCost: acc.kmCost + r.kmCost,
    mealsCost: acc.mealsCost + r.mealsCost,
    parkingCost: acc.parkingCost + r.parkingCost,
    total: acc.total + r.total,
  }), { regHours: 0, otHours: 0, labor: 0, kmCost: 0, mealsCost: 0, parkingCost: 0, total: 0 });

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t("costing.title")} · {dayjs(range.start).format("DD MMM")} – {dayjs(range.end).format("DD MMM YYYY")}</div>
              <p className="mt-1 text-xs text-muted-foreground">{t("costing.description")}</p>
            </div>
            <div className="flex overflow-hidden rounded-md border">
              {["week", "month"].map((p) => (
                <Button key={p} type="button" size="sm" variant={period === p ? "default" : "ghost"} className="rounded-none" onClick={() => setPeriod(p)}>
                  {t(`costing.period.${p}`)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">{t("costing.col.employee")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.regHours")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.otHours")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.labor")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.km")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.meals")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("costing.col.parking")}</th>
                  <th className="px-3 py-2.5 text-right font-medium bg-primary/5">{t("costing.col.total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">
                      {r.name}
                      {!r.hasRate && <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">({t("costing.noRate")})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.regHours.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.otHours.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(r.labor)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(r.kmCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(r.mealsCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(r.parkingCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold bg-primary/5">{money(r.total)}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">{t("costing.empty")}</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-3 py-2.5">{t("costing.totals")}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{totals.regHours.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{totals.otHours.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.labor)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.kmCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.mealsCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{money(totals.parkingCost)}</td>
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
