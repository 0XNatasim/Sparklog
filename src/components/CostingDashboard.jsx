import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculatePayrollEntries, calculateCongesIndemnity } from "@/lib/payroll-calculations";
import { useT } from "@/lib/use-t";
import EmployerContributionsManager from "@/components/EmployerContributionsManager";

dayjs.extend(isoWeek);

function montrealToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// CCQ level → the matching per-hour rate column on employer_contributions.
const LEVEL_RATE_KEY = {
  compagnon: "rate_compagnon",
  apprenti_4: "rate_apprenti_4",
  apprenti_3: "rate_apprenti_3",
  apprenti_2: "rate_apprenti_2",
  apprenti_1: "rate_apprenti_1",
};

export default function CostingDashboard() {
  const t = useT();
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  const range = useMemo(() => {
    const end = montrealToday();
    const start = period === "week"
      ? dayjs(end).startOf("isoWeek").format("YYYY-MM-DD")
      : dayjs(end).startOf("month").format("YYYY-MM-DD");
    return { start, end };
  }, [period]);

  function toggleRow(id) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = range;
      const [{ data: people }, { data: jobs }, { data: meals }, { data: parking }, { data: contribRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, hourly_rate, km_rate, team_leader_premium, apprentice_level"),
        supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, hourly_rate_snapshot, team_leader_premium_snapshot, km_rate_snapshot").gte("job_date", start).lte("job_date", end),
        supabase.from("meal_claims").select("user_id, amount").gte("job_date", start).lte("job_date", end),
        supabase.from("parking_receipts").select("user_id, amount").gte("job_date", start).lte("job_date", end),
        supabase.from("employer_contributions").select("*").eq("active", true).order("sort_order", { ascending: true }),
      ]);
      if (cancelled) return;

      const contributions = contribRows || [];
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
        const baseRate = Number(profile?.hourly_rate) || 0;
        const premium = Number(profile?.team_leader_premium) || 0;
        const level = profile?.apprentice_level || null;
        // Administration staff are non-CCQ: no CCQ level → no employer contributions,
        // and no 13% CCQ congés indemnity (that is a CCQ advantage they don't get).
        const isNonCcq = profile?.role === "admin";
        const rateKey = level && !isNonCcq ? LEVEL_RATE_KEY[level] : null;

        let regMin = 0, ot50Min = 0, ot100Min = 0, returnMin = 0, totalKm = 0, labor = 0, kmCost = 0;
        const entries = calculatePayrollEntries(jobsByUser.get(userId) || []);
        entries.forEach((e) => {
          regMin += e.regularWorkMinutes;
          ot50Min += e.overtime50Minutes;
          ot100Min += e.overtime100Minutes;
          returnMin += e.returnRegularMinutes;
          totalKm += e.totalKm;
          // Rate frozen on the job at submission (0034); fall back to current profile rate.
          const jobBase = Number(e.job?.hourly_rate_snapshot ?? profile?.hourly_rate) || 0;
          const jobPremium = Number(e.job?.team_leader_premium_snapshot ?? profile?.team_leader_premium) || 0;
          const jobKmRate = Number(e.job?.km_rate_snapshot ?? profile?.km_rate) || 0;
          labor += (jobBase + jobPremium) * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60 + (e.overtime50Minutes / 60) * 1.5 + (e.overtime100Minutes / 60) * 2);
          kmCost += e.totalKm * jobKmRate;
        });

        const conges = isNonCcq ? 0 : calculateCongesIndemnity(labor).total;
        const paidHours = (regMin + returnMin + ot50Min + ot100Min) / 60;
        // Employer contributions: per-hour rate for this employee's level × paid hours.
        const contribLines = rateKey
          ? contributions.map((c) => ({ code: c.code, label: c.label, amount: (Number(c[rateKey]) || 0) * paidHours })).filter((l) => l.amount !== 0)
          : [];
        const contribTotal = contribLines.reduce((s, l) => s + l.amount, 0);
        const mealsCost = mealByUser.get(userId) || 0;
        const parkingCost = parkingByUser.get(userId) || 0;

        result.push({
          userId,
          name: profile?.full_name || profile?.email || String(userId).slice(0, 8),
          hasRate: baseRate > 0,
          isNonCcq,
          hasLevel: Boolean(rateKey),
          premium,
          regHours: (regMin + returnMin) / 60,
          otHours: (ot50Min + ot100Min) / 60,
          labor, conges, contribTotal, contribLines, kmCost, mealsCost, parkingCost,
          total: labor + conges + contribTotal + kmCost + mealsCost + parkingCost,
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
    conges: acc.conges + r.conges,
    contribTotal: acc.contribTotal + r.contribTotal,
    expenses: acc.expenses + r.kmCost + r.mealsCost + r.parkingCost,
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
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">{t("costing.reviewNotice")}</p>
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

      <EmployerContributionsManager />

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
                  const expenses = r.kmCost + r.mealsCost + r.parkingCost;
                  return (
                    <React.Fragment key={r.userId}>
                      <tr className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">
                          <button type="button" onClick={() => toggleRow(r.userId)} className="mr-1.5 inline-flex items-center align-middle text-muted-foreground hover:text-foreground" aria-label={t("costing.breakdown")} aria-expanded={isOpen}>
                            <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </button>
                          {r.name}
                          {r.premium > 0 && <span className="ml-2 text-[11px] font-normal text-primary">({t("costing.teamLeader")} +{money(r.premium)}/h)</span>}
                          {!r.hasRate && <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">({t("costing.noRate")})</span>}
                          {r.isNonCcq && <span className="ml-2 text-[11px] font-normal text-violet-600 dark:text-violet-400">({t("manager.adminLabel")})</span>}
                          {!r.isNonCcq && !r.hasLevel && <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">({t("costing.noLevel")})</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.regHours.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.otHours.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.labor)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.conges)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(r.contribTotal)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(expenses)}</td>
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
                              <Detail label={t("costing.col.km")} value={money(r.kmCost)} />
                              <Detail label={t("costing.col.meals")} value={money(r.mealsCost)} />
                              <Detail label={t("costing.col.parking")} value={money(r.parkingCost)} />
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
                    <td className="px-3 py-2.5 text-right font-mono">{totals.regHours.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{totals.otHours.toFixed(2)}</td>
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
