import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlertTriangle, Download, Landmark } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeEmployeeWeekTalon, snapshotFromRow } from "@/payroll";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import { isNonCcqRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isPending = (s) => s === "submitted" || s === "updated";

function ccqWeekOf(dateStr) {
  const end = weekEndingSaturdayD(dateStr);
  return { key: end.format("YYYY-MM-DD"), start: weekStartSundayD(dateStr), end };
}

// DAS follow the PAY date, not the work week: a CCQ week ending Saturday is paid the
// following Thursday (end + 5 days). The month a week's DAS belongs to is that pay date's.
const payDateOf = (weekEnd) => weekEnd.add(5, "day");
const payMonthOf = (weekEnd) => payDateOf(weekEnd).format("YYYY-MM");

const EMPTY = { hours: 0, gross: 0, federalTax: 0, quebecTax: 0, rrq: 0, ei: 0, rqap: 0, fss: 0, remArc: 0, remQc: 0, remTotal: 0, net: 0 };

// ── DAS (déductions à la source) centralization sub-tab ──────────────────────
// Statutory withholdings (employee + employer) grouped into the two remittance buckets —
// Revenu Québec (impôt QC, RRQ, RQAP, FSS) and ARC (impôt féd, AE) — by CCQ week or by
// month (DAS are remitted monthly), for all employees or one. Draft figures from the
// unvalidated rule set; never a remittance filing.
export default function DasTab() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [jobsByEmp, setJobsByEmp] = useState(new Map());
  const [seedByEmp, setSeedByEmp] = useState(new Map());
  const [ledgerByEmp, setLedgerByEmp] = useState(new Map());
  const [weekKeys, setWeekKeys] = useState([]); // [{key,start,end,weekNo}] newest first
  const [period, setPeriod] = useState("month"); // "month" | "week"
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(""); // YYYY-MM
  const [selectedEmp, setSelectedEmp] = useState(""); // "" = all
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = dayjs().subtract(14, "month").format("YYYY-MM-DD");
        const [{ data: profs, error: pErr }, { data: jobs, error: jErr }, { data: seeds }, { data: ledgers }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, overtime_first_hour_double, return_overtime_no_benefits").order("full_name", { ascending: true }),
          supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, status").gte("job_date", since),
          supabase.from("payroll_ytd").select("*").eq("tax_year", 2026),
          supabase.from("payroll_period_ledger").select("*").eq("tax_year", 2026).order("period_end", { ascending: true }),
        ]);
        if (pErr) throw pErr;
        if (jErr) throw jErr;
        if (cancelled) return;
        // DAS are CCQ source deductions — subcontractors (billed by the trade, we receive
        // their invoice) and other non-CCQ roles are not remitted here.
        setEmployees((profs || []).filter((e) => !isNonCcqRole(e.role)));

        const jByE = new Map();
        const weeks = new Map();
        (jobs || []).forEach((j) => {
          if (!jByE.has(j.user_id)) jByE.set(j.user_id, []);
          jByE.get(j.user_id).push(j);
          const w = ccqWeekOf(j.job_date);
          if (!weeks.has(w.key)) weeks.set(w.key, { ...w, weekNo: ccqWeekNumber(w.end) });
        });
        setJobsByEmp(jByE);

        const sByE = new Map();
        (seeds || []).forEach((r) => sByE.set(r.user_id, r));
        setSeedByEmp(sByE);
        const lByE = new Map();
        (ledgers || []).forEach((r) => { if (!lByE.has(r.user_id)) lByE.set(r.user_id, []); lByE.get(r.user_id).push(r); });
        setLedgerByEmp(lByE);

        const wk = [...weeks.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
        setWeekKeys(wk);
        setSelectedWeek(wk[0]?.key || "");
        setSelectedMonth(wk[0] ? payMonthOf(wk[0].end) : dayjs().format("YYYY-MM"));
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Months present, keyed by PAY date (week end + 5 days = the following Thursday), newest first.
  const months = useMemo(() => {
    const m = new Map();
    weekKeys.forEach((w) => { const pd = payDateOf(w.end); const k = pd.format("YYYY-MM"); if (!m.has(k)) m.set(k, pd); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, d]) => ({ key, label: d.format("MMMM YYYY") }));
  }, [weekKeys]);

  // The CCQ weeks in scope for the current selection. Month = weeks PAID in that month.
  const scopeWeeks = useMemo(() => {
    if (period === "week") return weekKeys.filter((w) => w.key === selectedWeek);
    return weekKeys.filter((w) => payMonthOf(w.end) === selectedMonth);
  }, [period, weekKeys, selectedWeek, selectedMonth]);

  function openingFor(userId, weekStart) {
    const before = (ledgerByEmp.get(userId) || [])
      .filter((r) => r.period_end && dayjs(r.period_end).isBefore(weekStart))
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
    return snapshotFromRow(before[0] || seedByEmp.get(userId) || null);
  }

  // One row per employee, summing the DAS over every fully-approved CCQ week in scope.
  const rows = useMemo(() => {
    const targets = selectedEmp ? employees.filter((e) => e.id === selectedEmp) : employees;
    const out = [];
    for (const profile of targets) {
      const acc = { ...EMPTY };
      let anyJobs = false, pendingWeeks = 0, countedWeeks = 0;
      for (const w of scopeWeeks) {
        const jobs = (jobsByEmp.get(profile.id) || []).filter((j) => ccqWeekOf(j.job_date).key === w.key);
        if (!jobs.length) continue;
        anyJobs = true;
        const pending = jobs.filter((j) => isPending(j.status)).length;
        const approved = jobs.filter((j) => j.status === "approved");
        if (pending > 0) { pendingWeeks += 1; continue; }
        if (!approved.length) continue;
        let talon = null;
        try {
          talon = computeEmployeeWeekTalon({ profile, jobs: approved, opening: openingFor(profile.id, w.start), frequency: "weekly", weekDate: w.start.format("YYYY-MM-DD") });
        } catch { /* skip */ }
        if (!talon) continue;
        const emp = talon.result.employee, empr = talon.result.employer, das = talon.result.das;
        acc.hours += talon.hours.totalHours;
        acc.gross += n(talon.result.gross?.total);
        acc.federalTax += n(emp.federalTax); acc.quebecTax += n(emp.quebecTax);
        acc.rrq += n(emp.rrq?.total) + n(empr.rrq); acc.ei += n(emp.ei) + n(empr.ei); acc.rqap += n(emp.rqap) + n(empr.rqap);
        acc.fss += n(empr.fss);
        acc.remArc += n(das.arc); acc.remQc += n(das.quebec); acc.remTotal += n(das.total);
        acc.net += n(emp.netPay);
        countedWeeks += 1;
      }
      if (!anyJobs) continue;
      out.push({ profile, pendingWeeks, countedWeeks, ...acc });
    }
    return out;
  }, [scopeWeeks, employees, selectedEmp, jobsByEmp, seedByEmp, ledgerByEmp]);

  const computed = rows.filter((r) => r.countedWeeks > 0);
  const blocked = rows.filter((r) => r.pendingWeeks > 0);

  const totals = useMemo(() => {
    const acc = { ...EMPTY };
    computed.forEach((r) => { for (const k of Object.keys(acc)) acc[k] += n(r[k]); });
    return acc;
  }, [computed]);

  const hasScope = scopeWeeks.length > 0;

  // Download the current DAS table (per-employee + total) as CSV.
  function exportCsv() {
    if (!computed.length) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = [t("payroll.employee"), t("payroll.das.hours"), t("payroll.das.gross"), t("payroll.das.fed"), t("payroll.das.qc"), t("payroll.das.rrq"), t("payroll.das.ei"), t("payroll.das.rqap"), t("payroll.das.fss"), t("payroll.das.remArc"), t("payroll.das.remQc"), t("payroll.das.net")];
    const row = (name, r) => [esc(name), n(r.hours).toFixed(2), n(r.gross).toFixed(2), n(r.federalTax).toFixed(2), n(r.quebecTax).toFixed(2), n(r.rrq).toFixed(2), n(r.ei).toFixed(2), n(r.rqap).toFixed(2), n(r.fss).toFixed(2), n(r.remArc).toFixed(2), n(r.remQc).toFixed(2), n(r.net).toFixed(2)].join(",");
    const lines = [cols.map(esc).join(","), ...computed.map((r) => row(r.profile.full_name || r.profile.id, r)), row(t("payroll.das.total"), totals)];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DAS_${period === "month" ? selectedMonth : selectedWeek}${selectedEmp ? "_1emp" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("payroll.das.title")}</b> {t("payroll.das.intro")} {t("payroll.das.freqNote")}</div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Period toggle */}
            <div className="flex overflow-hidden rounded-md border">
              {["month", "week"].map((p) => (
                <Button key={p} type="button" size="sm" variant={period === p ? "default" : "ghost"} className="rounded-none" onClick={() => setPeriod(p)}>
                  {t(p === "month" ? "payroll.das.periodMonth" : "payroll.das.periodWeek")}
                </Button>
              ))}
            </div>

            {/* Month or week selector */}
            {period === "month" ? (
              <label className="block text-xs">
                <span className="text-muted-foreground">{t("payroll.das.monthSelect")}</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                  {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  {months.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
                </select>
              </label>
            ) : (
              <label className="block text-xs">
                <span className="text-muted-foreground">{t("payroll.weekSelect")}</span>
                <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                  {weekKeys.map((w) => (
                    <option key={w.key} value={w.key}>{t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM YYYY")}</option>
                  ))}
                  {weekKeys.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
                </select>
              </label>
            )}

            {/* Employee filter */}
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.employee")}</span>
              <select value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="">{t("payroll.das.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
              </select>
            </label>

            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!computed.length} className="ml-auto">
              <Download className="mr-1.5 h-4 w-4" /> {t("payroll.das.exportCsv")}
            </Button>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          {loading && <div className="text-xs text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {!loading && hasScope && (
        <>
          {blocked.length > 0 && (
            <Card>
              <CardContent className="flex items-start gap-2 p-4 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>{t("payroll.das.pending", { names: blocked.map((r) => r.profile.full_name).join(", ") })}</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-[10px] uppercase text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">{t("payroll.employee")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.hours")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.gross")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.fed")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.qc")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.rrq")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.ei")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.rqap")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.fss")}</th>
                      <th className="px-3 py-2.5 text-right font-medium bg-primary/5">{t("payroll.das.remArc")}</th>
                      <th className="px-3 py-2.5 text-right font-medium bg-primary/5">{t("payroll.das.remQc")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("payroll.das.net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.map((r) => (
                      <tr key={r.profile.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{r.profile.full_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.hours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.gross)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.federalTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.quebecTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.rrq)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.ei)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.rqap)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.fss)}</td>
                        <td className="px-3 py-2 text-right font-mono bg-primary/5">{money(r.remArc)}</td>
                        <td className="px-3 py-2 text-right font-mono bg-primary/5">{money(r.remQc)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.net)}</td>
                      </tr>
                    ))}
                    {computed.length === 0 && (
                      <tr><td colSpan={12} className="px-3 py-6 text-center text-xs text-muted-foreground">{t("payroll.das.empty")}</td></tr>
                    )}
                  </tbody>
                  {computed.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-primary/5 font-semibold">
                        <td className="px-3 py-2.5">{t("payroll.das.total")}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{totals.hours.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.gross)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.federalTax)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.quebecTax)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.rrq)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.ei)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.rqap)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.fss)}</td>
                        <td className="px-3 py-2.5 text-right font-mono bg-primary/10">{money(totals.remArc)}</td>
                        <td className="px-3 py-2.5 text-right font-mono bg-primary/10">{money(totals.remQc)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{money(totals.net)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
                <b>{t("payroll.das.remTotalLabel")}:</b> {money(totals.remTotal)} · {t("payroll.das.disclaimer")}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
