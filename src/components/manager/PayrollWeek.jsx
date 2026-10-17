import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BadgeCheck, CheckCircle2, Download, Printer } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import WeeklyReportButton from "@/components/WeeklyReportButton";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { fetchAllRows } from "@/lib/fetch-all";
import { companyDate } from "@/lib/company-time";
import { ccqWeekNumber } from "@/lib/ccq-week";
import { isOwnerRole } from "@/lib/roles";
import { loadHolidayDates } from "@/lib/company-holidays";
import { employerFromSettings, loadEmployerSettings, loadTaxProfiles } from "@/lib/payroll-settings";
import { computeEmployeeWeekTalon, formatTalonRef, YTD_COLUMN_TO_KEY, YTD_CCQ_COLUMN_TO_KEY } from "@/payroll/employee-week";
import { buildStubModel, defaultHeader } from "@/lib/paystub";
import { openTalonsPrint } from "@/lib/talon-print";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { TAX_YEAR, lastCompletedWeekEnd, planPayrollWeek, postPayrollWeek, weekBounds } from "@/lib/payroll-week";

const PROFILE_COLUMNS = "id, full_name, role, hourly_rate, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid";
const LEDGER_COLUMNS = ["user_id", "period_end", "period_start", "talon_seq", "boss_approved", ...[...YTD_COLUMN_TO_KEY, ...YTD_CCQ_COLUMN_TO_KEY].map(([, col]) => col)].join(", ");
const WEEKS_BACK = 12;

const money = (v) => `${(Number(v) || 0).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const hours = (v) => {
  const m = Math.round((Number(v) || 0) * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
const unwrap = (res) => {
  if (res.error) throw res.error;
  return res.data || [];
};

const STATE_STYLE = {
  posted: "bg-info/15 text-info",
  ready: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  blockedEarlier: "bg-warning/15 text-warning",
  blockedLater: "bg-warning/15 text-warning",
  error: "bg-destructive/15 text-destructive",
  empty: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

// Gestion V3 › Paie › Paie de la semaine: the week is picked once, then approvals → calcul and
// comptabilisation for every ready employee → all talons → DAS → summary and CCQ report.
export default function PayrollWeek({ messier = false }) {
  const t = useT();
  const { role } = useAuth();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [params, setParams] = useSearchParams();
  const lastEnd = useMemo(() => lastCompletedWeekEnd(companyDate()), []);
  const weekEnd = /^\d{4}-\d{2}-\d{2}$/.test(params.get("week") || "") ? params.get("week") : lastEnd;
  const weekOptions = useMemo(() => {
    const list = [];
    for (let i = -1; i < WEEKS_BACK; i += 1) list.push(dayjs(lastEnd).subtract(i, "week").format("YYYY-MM-DD"));
    if (!list.includes(weekEnd)) list.push(weekEnd);
    return list.sort().reverse();
  }, [lastEnd, weekEnd]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const bounds = weekBounds(weekEnd);
  const weekNo = ccqWeekNumber(dayjs(weekEnd));
  const weekForReport = useMemo(() => ({ start: dayjs(bounds.start), end: dayjs(bounds.end), weekNo }), [bounds.start, bounds.end, weekNo]);

  const load = useCallback(async () => {
    try {
      const { end } = weekBounds(weekEnd);
      const [profiles, jobs, seeds, ledger, kept, settingsRow, taxProfiles, holidayDates, rounding] = await Promise.all([
        supabase.from("profiles").select(PROFILE_COLUMNS).then(unwrap),
        fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, status, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes").gte("job_date", `${TAX_YEAR}-01-01`).lte("job_date", end).order("id")).then(unwrap),
        supabase.from("payroll_ytd").select("*").eq("tax_year", TAX_YEAR).then(unwrap),
        fetchAllRows(() => supabase.from("payroll_period_ledger").select(LEDGER_COLUMNS).eq("tax_year", TAX_YEAR).order("period_end").order("user_id")).then(unwrap),
        supabase.from("payroll_period_ledger").select("user_id, imported_talon").eq("tax_year", TAX_YEAR).eq("period_end", end).then(unwrap),
        loadEmployerSettings(),
        loadTaxProfiles(),
        loadHolidayDates(),
        loadDayRounding({ untilDate: end }),
      ]);
      const ledgerByUser = new Map();
      for (const row of ledger) {
        if (!ledgerByUser.has(row.user_id)) ledgerByUser.set(row.user_id, []);
        ledgerByUser.get(row.user_id).push(row);
      }
      setErr("");
      setData({
        weekEnd: end, profiles, jobs, ledgerByUser, taxProfiles, holidayDates, rounding,
        seedByUser: new Map(seeds.map((row) => [row.user_id, row])),
        keptByUser: new Map(kept.filter((row) => row.imported_talon).map((row) => [row.user_id, row.imported_talon])),
        employer: employerFromSettings(settingsRow),
      });
    } catch (e) {
      setErr(e?.message || t("payWeek.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [weekEnd, t]);

  // load() sets state only after its first await.
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const plan = useMemo(() => {
    if (!data || data.weekEnd !== weekEnd) return null;
    const { start } = weekBounds(weekEnd);
    return planPayrollWeek({
      weekEnd,
      profiles: data.profiles,
      jobs: data.jobs,
      ledgerByUser: data.ledgerByUser,
      seedByUser: data.seedByUser,
      taxProfiles: data.taxProfiles,
      compute: (profile, approved, opening) => computeEmployeeWeekTalon({
        profile, jobs: approved, opening, frequency: "weekly", includePhone: true, includeStorage: true,
        weekDate: start, messierMethod: messier, holidayDates: data.holidayDates, employer: data.employer,
        taxProfile: data.taxProfiles.get(profile.id), rounding: roundingFor(data.rounding, profile.id),
      }),
    });
  }, [data, weekEnd, messier]);

  function setWeek(value) {
    const next = new URLSearchParams(params);
    if (value === lastEnd) next.delete("week"); else next.set("week", value);
    setParams(next, { replace: true });
    setInfo("");
    setLoading(true);
  }

  async function postReady() {
    if (!plan?.ready.length) return;
    const ok = await confirm(t("payWeek.confirmPost", { count: plan.ready.length, week: weekNo }));
    if (!ok) return;
    setBusy("post"); setErr(""); setInfo("");
    try {
      const { posted, failed } = await postPayrollWeek(supabase, plan.ready, { weekEnd, weekNo });
      if (failed.length) setErr(t("payWeek.postFailed", { names: failed.map((f) => nameOf(f.userId)).join(", "), message: failed[0].message }));
      setInfo(t("payWeek.posted", { count: posted.length }));
    } finally {
      setBusy("");
      await load();
    }
  }

  function nameOf(userId) {
    return plan?.rows.find((row) => row.profile.id === userId)?.profile.full_name || userId;
  }

  // Every talon of the week in one window: the kept talon once comptabilisé, else the live one.
  function printTalons() {
    const items = [];
    for (const row of plan.rows) {
      const kept = data.keptByUser.get(row.profile.id);
      if (row.state === "posted" && kept) { items.push({ kind: "kept", data: kept }); continue; }
      if (!row.talon || (row.state !== "posted" && row.state !== "ready")) continue;
      const model = buildStubModel({ result: row.talon.result, ytd: row.opening, pay: row.talon.pay, reimb: row.talon.reimb, ccq: row.talon.ccqAmounts });
      if (!model) continue;
      const hdr = defaultHeader({ week: weekForReport, reference: formatTalonRef(row.posted?.talon_seq) });
      items.push({ kind: "stub", model, hdr, employee: row.profile, frequency: "weekly", official: Boolean(row.posted?.boss_approved) });
    }
    if (!items.length) { setInfo(t("payWeek.noTalons")); return; }
    const ok = openTalonsPrint(items, `${t("mgr.nav.stubs")} — S${weekNo}`);
    setInfo(ok ? t("payWeek.talonsOpened", { count: items.length }) : t("weeklyReport.popupBlocked"));
  }

  async function approveOfficial() {
    const targets = plan.rows.filter((row) => row.state === "posted" && !row.posted?.boss_approved);
    if (!targets.length) return;
    const ok = await confirm(t("payWeek.confirmOfficial", { count: targets.length }));
    if (!ok) return;
    setBusy("official"); setErr(""); setInfo("");
    try {
      for (const row of targets) {
        const { error } = await supabase.rpc("set_talon_boss_approval", { p_user_id: row.profile.id, p_period_end: weekEnd, p_approved: true });
        if (error) throw error;
      }
      setInfo(t("payWeek.officialDone", { count: targets.length }));
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy("");
      await load();
    }
  }

  function exportDasCsv() {
    const rows = plan.rows.filter((row) => row.talon && (row.state === "posted" || row.state === "ready"));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [t("payroll.employee"), t("payWeek.col.gross"), t("payWeek.col.deductions"), t("payWeek.col.net"), t("payroll.das.remArc"), t("payroll.das.remQc"), t("payWeek.col.das")];
    const line = (name, r) => [esc(name), ...[r.gross, r.deductions, r.net, r.dasArc, r.dasQuebec, r.das].map((v) => (Number(v) || 0).toFixed(2))].join(",");
    const lines = [head.map(esc).join(","), ...rows.map((r) => line(r.profile.full_name, r)), line(t("payroll.das.total"), plan.totals)];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DAS_semaine_${weekNo}_${weekEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = plan?.counts;
  const pendingRows = plan?.rows.filter((row) => row.state === "pending") || [];
  const postedCount = counts?.posted || 0;
  const unofficial = plan?.rows.filter((row) => row.state === "posted" && !row.posted?.boss_approved).length || 0;
  const steps = plan ? [
    { n: 1, title: t("payWeek.step.approvals"), state: pendingRows.length ? t("payWeek.step.toApprove", { count: pendingRows.length }) : t("payWeek.step.done"), done: !pendingRows.length },
    { n: 2, title: t("payWeek.step.calc"), state: counts.ready ? t("payWeek.step.ready", { count: counts.ready }) : t("payWeek.step.postedCount", { count: postedCount }), done: !counts.ready && postedCount > 0 },
    { n: 3, title: t("payWeek.step.talons"), state: postedCount ? t("payWeek.step.postedCount", { count: postedCount }) : t("payWeek.step.afterCalc"), done: false },
    { n: 4, title: t("payWeek.step.das"), state: money(plan.totals.das), done: false },
    { n: 5, title: t("payWeek.step.summary"), state: t("payWeek.step.print"), done: false },
  ] : [];

  return (
    <div className="space-y-4">
      {confirmDialog}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{t("mgr.nav.payrollWeek")}</h2>
        <label className="flex w-full flex-col gap-1 text-xs font-semibold text-muted-foreground sm:w-auto">
          {t("payWeek.weekLabel")}
          <select
            value={weekEnd}
            onChange={(e) => setWeek(e.target.value)}
            className="min-h-10 w-full rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground sm:min-w-[18rem]"
          >
            {weekOptions.map((end) => {
              const b = weekBounds(end);
              return (
                <option key={end} value={end}>
                  {t("payWeek.weekOption", { no: ccqWeekNumber(dayjs(end)), start: dayjs(b.start).format("D MMM"), end: dayjs(b.end).format("D MMM"), pay: dayjs(b.payDate).format("ddd D MMM") })}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      {info && <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{info}</div>}
      {loading && <div className="text-sm text-muted-foreground">{t("common.working")}</div>}

      {plan && (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={t("payWeek.stepsLabel")}>
            {steps.map((step) => (
              <li key={step.n} className={cn("flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5", step.done && "border-success/40")}>
                <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", step.done ? "bg-success text-success-foreground" : "bg-muted text-foreground")}>
                  {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.n}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{step.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{step.state}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* 1 — Approvals */}
          <Card><CardContent className="space-y-2 p-4">
            <h3 className="font-semibold">1 · {t("payWeek.step.approvals")}</h3>
            {pendingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("payWeek.allApproved", { count: counts.employees })}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("payWeek.pendingIntro")}</p>
                <ul className="space-y-1 text-sm">
                  {pendingRows.map((row) => (
                    <li key={row.profile.id}>
                      <b>{row.profile.full_name}</b>
                      {row.toApprove > 0 && <> · {t("payWeek.toApprove", { count: row.toApprove })}</>}
                      {row.notSubmitted > 0 && <> · {t("payWeek.notSubmitted", { count: row.notSubmitted })}</>}
                    </li>
                  ))}
                </ul>
                <Button asChild size="sm" variant="outline"><Link to="/manager/todo">{t("payWeek.openTodo")}</Link></Button>
              </>
            )}
          </CardContent></Card>

          {/* 2 — Calcul + comptabilisation */}
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">2 · {t("payWeek.step.calc")}</h3>
              <Button type="button" className="h-auto min-h-10 whitespace-normal py-2" disabled={!counts.ready || Boolean(busy)} onClick={postReady}>
                {busy === "post" ? t("common.working") : counts.ready ? t("payWeek.postReady", { count: counts.ready }) : t("payWeek.nothingToPost")}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t("payroll.employee")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.hours")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.gross")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.deductions")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.net")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("payWeek.col.das")}</th>
                    <th className="px-2 py-2 font-medium">{t("payWeek.col.state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.profile.id} className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{row.profile.full_name}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.talon ? hours(row.hours) : "—"}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.talon ? money(row.gross) : "—"}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.talon ? money(row.deductions) : "—"}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.talon ? money(row.net) : "—"}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.talon ? money(row.das) : "—"}</td>
                      <td className="px-2 py-2">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STATE_STYLE[row.state])}>
                          {t(`payWeek.state.${row.state}`, { week: row.earlierUnposted[0] ? ccqWeekNumber(dayjs(row.earlierUnposted[0])) : "" })}
                        </span>
                        {row.posted?.talon_seq && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{formatTalonRef(row.posted.talon_seq)}</span>}
                        {(row.noOpening || row.noTaxProfile) && (row.state === "ready" || row.state === "posted") && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertTriangle className="h-3 w-3 text-warning" />
                            {[row.noOpening && t("payWeek.warn.noOpening"), row.noTaxProfile && t("payWeek.warn.noTd1")].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {row.error && <div className="mt-0.5 text-xs text-destructive">{row.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="px-2 py-2">{t("payroll.das.total")}</td>
                    <td />
                    <td className="px-2 py-2 text-right font-mono">{money(plan.totals.gross)}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(plan.totals.deductions)}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(plan.totals.net)}</td>
                    <td className="px-2 py-2 text-right font-mono">{money(plan.totals.das)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("payWeek.calcNote")}</p>
          </CardContent></Card>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* 3 — Talons */}
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-semibold">3 · {t("payWeek.step.talons")}</h3>
              <p className="text-sm text-muted-foreground">{t("payWeek.talonsIntro", { count: postedCount })}</p>
              <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal py-2 text-left" disabled={!postedCount && !counts.ready} onClick={printTalons}>
                <Printer className="mr-1.5 h-4 w-4" /> {t("payWeek.printTalons")}
              </Button>
              {isOwnerRole(role) && (
                <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal py-2 text-left" disabled={!unofficial || Boolean(busy)} onClick={approveOfficial}>
                  <BadgeCheck className="mr-1.5 h-4 w-4" /> {busy === "official" ? t("common.working") : t("payWeek.approveOfficial", { count: unofficial })}
                </Button>
              )}
            </CardContent></Card>

            {/* 4 — DAS */}
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-semibold">4 · {t("payWeek.step.das")}</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("payroll.das.remArc")}</dt><dd className="text-right font-mono">{money(plan.totals.dasArc)}</dd>
                <dt className="text-muted-foreground">{t("payroll.das.remQc")}</dt><dd className="text-right font-mono">{money(plan.totals.dasQuebec)}</dd>
                <dt className="font-semibold">{t("payWeek.dasWeek")}</dt><dd className="text-right font-mono font-semibold">{money(plan.totals.das)}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">{t("payWeek.dasNote", { pay: dayjs(bounds.payDate).format("D MMMM") })}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={exportDasCsv}><Download className="mr-1.5 h-4 w-4" />{t("payroll.das.exportCsv")}</Button>
                <Button asChild variant="ghost" size="sm"><Link to="/manager/v3/pay-history?tab=das">{t("payWeek.openDasMonth")}</Link></Button>
              </div>
            </CardContent></Card>

            {/* 5 — Summary + CCQ */}
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-semibold">5 · {t("payWeek.step.summary")}</h3>
              <WeeklyReportButton week={weekForReport} />
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm text-muted-foreground">{t("payWeek.ccqIntro")}</p>
                <Button asChild variant="outline" size="sm"><Link to="/manager/v3/reports?tab=ccq">{t("payWeek.openCcq")}</Link></Button>
              </div>
            </CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">{t("payWeek.disclaimer")}</p>
        </>
      )}
    </div>
  );
}
