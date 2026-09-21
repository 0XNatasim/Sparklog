import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculatePayrollEntries, calculateCongesIndemnity, congesRatesFromRow, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { weekStartSundayD, weekEndingSaturdayD, ccqWeekNumber } from "@/lib/ccq-week";
import { useT } from "@/lib/use-t";
import EmployerContributionsManager from "@/components/EmployerContributionsManager";
import CongesIndemnityManager from "@/components/CongesIndemnityManager";

function montrealToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// CCQ week key (ending Saturday) — used to prorate weekly reimbursements.
const ccqWeekKey = (dateStr) => {
  const d = dayjs(dateStr);
  return d.add((6 - d.day() + 7) % 7, "day").format("YYYY-MM-DD");
};

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
  const [period, setPeriod] = useState("week");
  const [weekEnd, setWeekEnd] = useState(() => weekEndingSaturdayD(montrealToday()).format("YYYY-MM-DD"));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = range;
      const [{ data: people }, { data: jobs }, { data: meals }, { data: parking }, { data: contribRows }, { data: congesRow }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, phone_data_reimbursement, overtime_first_hour_double, return_overtime_no_benefits"),
        // C-4: only count payable work/expenses. Jobs: submitted + approved (exclude
        // 'saved' drafts and 'updated' un-reviewed edits). Claims: pending + approved
        // (exclude rejected — a rejected expense must not inflate the estimate).
        supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, hourly_rate_snapshot, team_leader_premium_snapshot, km_rate_snapshot").in("status", ["submitted", "approved"]).gte("job_date", start).lte("job_date", end),
        supabase.from("meal_claims").select("user_id, amount").in("status", ["pending", "approved"]).gte("job_date", start).lte("job_date", end),
        supabase.from("parking_receipts").select("user_id, amount").in("status", ["pending", "approved"]).gte("job_date", start).lte("job_date", end),
        supabase.from("employer_contributions").select("*").eq("active", true).order("sort_order", { ascending: true }),
        supabase.from("conges_indemnity_rate").select("*").eq("id", true).maybeSingle(),
      ]);
      if (cancelled) return;

      const contributions = contribRows || [];
      const congesRates = congesRatesFromRow(congesRow);
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

        let regMin = 0, ot50Min = 0, ot100Min = 0, returnMin = 0, returnNbMin = 0, totalKm = 0, labor = 0, laborNoBenefit = 0, kmCost = 0;
        const entries = calculatePayrollEntries(jobsByUser.get(userId) || [], overtimeOptionsFromProfile(profile));
        entries.forEach((e) => {
          regMin += e.regularWorkMinutes;
          ot50Min += e.overtime50Minutes;
          ot100Min += e.overtime100Minutes;
          returnMin += e.returnRegularMinutes;
          returnNbMin += e.returnNoBenefitMinutes;
          totalKm += e.totalKm;
          // Rate frozen on the job at submission (0034); fall back to current profile rate.
          const jobBase = Number(e.job?.hourly_rate_snapshot ?? profile?.hourly_rate) || 0;
          const jobPremium = Number(e.job?.team_leader_premium_snapshot ?? profile?.team_leader_premium) || 0;
          const jobKmRate = Number(e.job?.km_rate_snapshot ?? profile?.km_rate) || 0;
          labor += (jobBase + jobPremium) * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60 + (e.overtime50Minutes / 60) * 1.5 + (e.overtime100Minutes / 60) * 2);
          // Return time carved out when the day exceeds 8h: base rate, no premium, and
          // excluded from the CCQ social-benefits (13% congés) base.
          laborNoBenefit += jobBase * (e.returnNoBenefitMinutes / 60);
          kmCost += e.totalKm * jobKmRate;
        });

        const conges = isNonCcq ? 0 : calculateCongesIndemnity(labor, congesRates).total;
        const paidHours = (regMin + returnMin + returnNbMin + ot50Min + ot100Min) / 60;
        // Employer contributions: per-hour rate for this employee's level × paid hours.
        const contribLines = rateKey
          ? contributions.map((c) => ({ code: c.code, label: c.label, amount: (Number(c[rateKey]) || 0) * paidHours })).filter((l) => l.amount !== 0)
          : [];
        const contribTotal = contribLines.reduce((s, l) => s + l.amount, 0);
        // Meals are the CCQ supper allowance — a CCQ advantage, so not for admin staff.
        // km and parking are actual expense reimbursements and still apply.
        const mealsCost = isNonCcq ? 0 : (mealByUser.get(userId) || 0);
        const parkingCost = parkingByUser.get(userId) || 0;
        // Phone/data reimbursement is a fixed weekly amount — prorate by the number
        // of distinct CCQ weeks the employee actually worked in the range.
        const weeksWorked = new Set((jobsByUser.get(userId) || []).map((j) => ccqWeekKey(j.job_date))).size;
        const phoneData = weeksWorked * (Number(profile?.phone_data_reimbursement) || 0);

        result.push({
          userId,
          name: profile?.full_name || profile?.email || String(userId).slice(0, 8),
          hasRate: baseRate > 0,
          isNonCcq,
          hasLevel: Boolean(rateKey),
          premium,
          regHours: (regMin + returnMin) / 60,
          otHours: (ot50Min + ot100Min) / 60,
          returnNbHours: returnNbMin / 60,
          labor: labor + laborNoBenefit, conges, contribTotal, contribLines, kmCost, mealsCost, parkingCost, phoneData,
          total: labor + laborNoBenefit + conges + contribTotal + kmCost + mealsCost + parkingCost + phoneData,
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
    expenses: acc.expenses + r.kmCost + r.mealsCost + r.parkingCost + r.phoneData,
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
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">{t("costing.reviewNotice")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {period === "week" && (
                <select
                  value={weekEnd}
                  onChange={(e) => setWeekEnd(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
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
                  const expenses = r.kmCost + r.mealsCost + r.parkingCost + r.phoneData;
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
                              <Detail label={t("costing.col.phoneData")} value={money(r.phoneData)} />
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
