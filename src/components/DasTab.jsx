import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlertTriangle, Landmark } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { computeEmployeeWeekTalon, snapshotFromRow } from "@/payroll";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import { useT } from "@/lib/use-t";

const n = (v) => Number(v) || 0;
const money = (v) => `$${n(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isPending = (s) => s === "submitted" || s === "updated";

function ccqWeekOf(dateStr) {
  const end = weekEndingSaturdayD(dateStr);
  return { key: end.format("YYYY-MM-DD"), start: weekStartSundayD(dateStr), end };
}

// ── DAS (déductions à la source) centralization sub-tab ──────────────────────
// One row per employee for a chosen CCQ week: statutory withholdings (employee + employer)
// grouped into the two remittance buckets — Revenu Québec (impôt QC, RRQ, RQAP, FSS) and
// ARC (impôt féd, AE). Draft figures from the unvalidated rule set; never a remittance filing.
export default function DasTab() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [jobsByEmp, setJobsByEmp] = useState(new Map());
  const [seedByEmp, setSeedByEmp] = useState(new Map());   // user_id → payroll_ytd row
  const [ledgerByEmp, setLedgerByEmp] = useState(new Map()); // user_id → [ledger rows]
  const [weekKeys, setWeekKeys] = useState([]); // [{key,start,end,weekNo}]
  const [selectedWeek, setSelectedWeek] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = dayjs().subtract(16, "week").format("YYYY-MM-DD");
        const [{ data: profs, error: pErr }, { data: jobs, error: jErr }, { data: seeds }, { data: ledgers }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, overtime_first_hour_double, return_overtime_no_benefits").order("full_name", { ascending: true }),
          supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, status").gte("job_date", since),
          supabase.from("payroll_ytd").select("*").eq("tax_year", 2026),
          supabase.from("payroll_period_ledger").select("*").eq("tax_year", 2026).order("period_end", { ascending: true }),
        ]);
        if (pErr) throw pErr;
        if (jErr) throw jErr;
        if (cancelled) return;
        setEmployees(profs || []);

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
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const week = useMemo(() => weekKeys.find((w) => w.key === selectedWeek) || null, [weekKeys, selectedWeek]);

  // Opening balance for one employee for the selected week (latest ledger snapshot ending
  // before the week starts, else the seed).
  function openingFor(userId, weekStart) {
    const before = (ledgerByEmp.get(userId) || [])
      .filter((r) => r.period_end && dayjs(r.period_end).isBefore(weekStart))
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
    return snapshotFromRow(before[0] || seedByEmp.get(userId) || null);
  }

  // One DAS row per employee who has jobs this week. `pending` marks a week not yet fully
  // approved (its figures are withheld until approval, like the Talon tab).
  const rows = useMemo(() => {
    if (!week) return [];
    const out = [];
    for (const profile of employees) {
      const jobs = (jobsByEmp.get(profile.id) || []).filter((j) => ccqWeekOf(j.job_date).key === week.key);
      if (!jobs.length) continue;
      const pending = jobs.filter((j) => isPending(j.status)).length;
      const approved = jobs.filter((j) => j.status === "approved");
      if (pending > 0 || approved.length === 0) {
        out.push({ profile, pending, approved: approved.length });
        continue;
      }
      let talon = null;
      try {
        talon = computeEmployeeWeekTalon({ profile, jobs: approved, opening: openingFor(profile.id, week.start), frequency: "weekly", weekDate: week.start.format("YYYY-MM-DD") });
      } catch { /* skip on compute error */ }
      if (!talon) { out.push({ profile, pending: 0, approved: approved.length, failed: true }); continue; }
      const emp = talon.result.employee, empr = talon.result.employer, das = talon.result.das;
      out.push({
        profile, pending: 0, approved: approved.length,
        hours: talon.hours.totalHours,
        gross: n(talon.result.gross?.total),
        federalTax: n(emp.federalTax), quebecTax: n(emp.quebecTax),
        rrq: n(emp.rrq?.total) + n(empr.rrq), ei: n(emp.ei) + n(empr.ei), rqap: n(emp.rqap) + n(empr.rqap),
        fss: n(empr.fss),
        remArc: n(das.arc), remQc: n(das.quebec), remTotal: n(das.total),
        net: n(emp.netPay),
      });
    }
    return out;
  }, [week, employees, jobsByEmp, seedByEmp, ledgerByEmp]);

  const totals = useMemo(() => {
    const acc = { hours: 0, gross: 0, federalTax: 0, quebecTax: 0, rrq: 0, ei: 0, rqap: 0, fss: 0, remArc: 0, remQc: 0, remTotal: 0, net: 0 };
    rows.forEach((r) => { if (!r.pending && !r.failed && r.approved) for (const k of Object.keys(acc)) acc[k] += n(r[k]); });
    return acc;
  }, [rows]);

  const computed = rows.filter((r) => !r.pending && !r.failed && r.approved);
  const blocked = rows.filter((r) => r.pending > 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("payroll.das.title")}</b> {t("payroll.das.intro")}</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <label className="block text-xs sm:max-w-sm">
            <span className="text-muted-foreground">{t("payroll.weekSelect")}</span>
            <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
              {weekKeys.map((w) => (
                <option key={w.key} value={w.key}>{t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM YYYY")}</option>
              ))}
              {weekKeys.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
            </select>
          </label>
          {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
          {loading && <div className="mt-3 text-xs text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {!loading && week && (
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
