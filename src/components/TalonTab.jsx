import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { BadgeCheck, Clock, FileText, Printer, Upload } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeEmployeeWeekTalon, snapshotFromRow, formatTalonRef } from "@/payroll";
import { buildStubModel, defaultHeader } from "@/lib/paystub";
import { openTalonsPrint } from "@/lib/talon-print";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import { isOwnerRole, isSubcontractorRole } from "@/lib/roles";
import { isFixedPayWeek, isPayrollEmployee } from "@/lib/fixed-pay";
import { useAuth } from "@/contexts/AuthContext";
import PayStubPrint from "@/components/PayStubPrint";
import ImportLegacyStubsDialog from "@/components/ImportLegacyStubsDialog";
import { printLegacyTalon } from "@/lib/legacy-talon-render";
import { useT } from "@/lib/use-t";
import { useHolidayDates } from "@/lib/company-holidays";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { usePayrollSettings } from "@/lib/payroll-settings";

const isPending = (s) => s === "submitted" || s === "updated";
const NB_WEEKS = 12;

function ccqWeekOf(dateStr) {
  const end = weekEndingSaturdayD(dateStr);
  return { key: end.format("YYYY-MM-DD"), start: weekStartSundayD(dateStr), end };
}

// ── Talon (pay stub) sub-tab ─────────────────────────────────────────────────
// A matrix: one row per employee, one column per CCQ week. A clickable PDF icon marks a
// week whose talon is available — filled/red once the week is COMPTABILISÉ (a ledger
// snapshot exists), outlined/amber for an APERÇU (fully approved but not yet comptabilisé,
// recomputed live). Clicking opens the full talon (PayStubPrint). Rien n'est persisté ici.
export default function TalonTab({ messier = false }) {
  const holidayDates = useHolidayDates();
  const { employer, taxProfiles } = usePayrollSettings();
  const t = useT();
  const { role } = useAuth();
  const isOwner = isOwnerRole(role); // only the boss (owner) can mark a talon official
  const [employees, setEmployees] = useState([]);
  const [jobsByEmp, setJobsByEmp] = useState(new Map());
  const [seedByEmp, setSeedByEmp] = useState(new Map());
  const [ledgerByEmp, setLedgerByEmp] = useState(new Map());
  const [roundingByEmp, setRoundingByEmp] = useState(new Map()); // day-rounding counters
  const [weeks, setWeeks] = useState([]); // [{key,start,end,weekNo}] newest first
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stub, setStub] = useState(null); // { profile, weekObj, talon, opening }
  const [batchWeek, setBatchWeek] = useState(""); // week key for the "generate all" export
  const [batchMsg, setBatchMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false); // legacy-stub import dialog
  const [reloadKey, setReloadKey] = useState(0); // bump to reload after an import

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = dayjs().subtract(NB_WEEKS + 2, "week").format("YYYY-MM-DD");
        const [{ data: profs, error: pErr }, { data: jobs, error: jErr }, { data: seeds }, { data: ledgers }, rounding] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid").order("full_name", { ascending: true }),
          fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes, status").gte("job_date", since).order("id")),
          supabase.from("payroll_ytd").select("*").eq("tax_year", 2026),
          fetchAllRows(() => supabase.from("payroll_period_ledger").select("*").eq("tax_year", 2026).order("period_end", { ascending: true }).order("user_id")),
          loadDayRounding(),
        ]);
        if (pErr) throw pErr;
        if (jErr) throw jErr;
        if (cancelled) return;
        // Talons are a CCQ payroll artifact — subcontractors (billed by the trade) never get one, and
        // other non-CCQ roles only with a fixed weekly pay (`payrollEmployees` below, once the
        // tax profiles are loaded).
        setEmployees((profs || []).filter((e) => !isSubcontractorRole(e.role)));

        const jByE = new Map();
        const weekMap = new Map();
        (jobs || []).forEach((j) => {
          if (!jByE.has(j.user_id)) jByE.set(j.user_id, []);
          jByE.get(j.user_id).push(j);
          const w = ccqWeekOf(j.job_date);
          if (!weekMap.has(w.key)) weekMap.set(w.key, { ...w, weekNo: ccqWeekNumber(w.end) });
        });
        setJobsByEmp(jByE);

        const sByE = new Map();
        (seeds || []).forEach((r) => sByE.set(r.user_id, r));
        setSeedByEmp(sByE);
        const lByE = new Map();
        (ledgers || []).forEach((r) => { if (!lByE.has(r.user_id)) lByE.set(r.user_id, []); lByE.get(r.user_id).push(r); });
        setLedgerByEmp(lByE);
        setRoundingByEmp(rounding);

        // Weeks in the register (imported or validated stubs) always show, even without jobs.
        const recent = [...weekMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, NB_WEEKS);
        const all = new Map(recent.map((w) => [w.key, w]));
        (ledgers || []).forEach((r) => {
          if (!r.imported_talon || !r.period_end || all.has(r.period_end)) return;
          const end = dayjs(r.period_end);
          all.set(r.period_end, { key: r.period_end, start: weekStartSundayD(r.period_end), end, weekNo: ccqWeekNumber(end) });
        });
        const wk = [...all.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
        setWeeks(wk);
        setBatchWeek(wk[0]?.key || "");
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Employees in the payroll run (CCQ trades + fixed weekly pay, src/lib/fixed-pay.js) that have a job,
  // a kept talon or a fixed-pay week in the window, in roster order.
  const payrollEmployees = useMemo(() => employees.filter((e) => isPayrollEmployee(e, taxProfiles.get(e.id))), [employees, taxProfiles]);
  const rows = useMemo(() => payrollEmployees.filter((e) => (jobsByEmp.get(e.id) || []).length > 0
    || (ledgerByEmp.get(e.id) || []).some((r) => r.imported_talon)
    || weeks.some((w) => isFixedPayWeek(taxProfiles.get(e.id), w.key))), [payrollEmployees, jobsByEmp, ledgerByEmp, weeks, taxProfiles]);

  // Opening balance for an employee at a week start (latest ledger ending before, else seed).
  function openingFor(userId, weekStart) {
    const before = (ledgerByEmp.get(userId) || [])
      .filter((r) => r.period_end && dayjs(r.period_end).isBefore(weekStart))
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
    return snapshotFromRow(before[0] || seedByEmp.get(userId) || null);
  }

  // The per-cell state for (employee, week).
  function cellState(profile, week) {
    const jobs = (jobsByEmp.get(profile.id) || []).filter((j) => ccqWeekOf(j.job_date).key === week.key);
    // A stub kept in the register (imported or validated against the real one) is shown as is.
    const kept = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key && r.imported_talon);
    if (kept) return { kind: "imported", talon: kept.imported_talon };
    // Fixed weekly pay: a talon every week from the start date, whatever the jobs (their km count once approved).
    if (isFixedPayWeek(taxProfiles.get(profile.id), week.key)) {
      const ledgerRow = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key);
      const approved = jobs.filter((j) => j.status === "approved");
      if (ledgerRow) return { kind: ledgerRow.boss_approved ? "official" : "comptabilise", jobs: approved };
      return { kind: "apercu", jobs: approved };
    }
    if (!jobs.length) return { kind: "none" };
    const pending = jobs.filter((j) => isPending(j.status)).length;
    const approved = jobs.filter((j) => j.status === "approved");
    const ledgerRow = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key);
    if (ledgerRow && approved.length) return { kind: ledgerRow.boss_approved ? "official" : "comptabilise", jobs: approved };
    if (pending > 0) return { kind: "pending" };
    if (approved.length) return { kind: "apercu", jobs: approved };
    return { kind: "draft" };
  }

  function openTalon(profile, week, jobs) {
    try {
      const opening = openingFor(profile.id, week.start);
      const talon = computeEmployeeWeekTalon({ profile, jobs, opening, frequency: "weekly", includePhone: true, includeStorage: true, weekDate: week.start.format("YYYY-MM-DD"), messierMethod: messier, holidayDates, employer, taxProfile: taxProfiles.get(profile.id), rounding: roundingFor(roundingByEmp, profile.id) });
      // Reference is assigned at comptabilisation only; blank for an aperçu.
      const ledgerRow = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key);
      const reference = formatTalonRef(ledgerRow?.talon_seq);
      // The boss (owner) can approve only a comptabilisé week (a ledger row exists).
      setStub({
        profile, weekObj: { start: week.start, end: week.end, weekNo: week.weekNo }, talon, opening, reference,
        weekKey: week.key, official: !!ledgerRow?.boss_approved, canApprove: isOwner && !!ledgerRow,
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  // Owner toggles a talon "official" (boss-approved) → drops the DRAFT watermark.
  async function toggleOfficial(next) {
    if (!stub) return;
    const { profile, weekKey } = stub;
    setStub((s) => (s ? { ...s, official: next } : s)); // optimistic
    const { error: rpcErr } = await supabase.rpc("set_talon_boss_approval", { p_user_id: profile.id, p_period_end: weekKey, p_approved: next });
    if (rpcErr) {
      setStub((s) => (s ? { ...s, official: !next } : s)); // revert
      setError(rpcErr.message);
      return;
    }
    // Reflect in the matrix (cell colour) without a reload.
    setLedgerByEmp((prev) => {
      const map = new Map(prev);
      const list = (map.get(profile.id) || []).map((r) => (r.period_end === weekKey ? { ...r, boss_approved: next } : r));
      map.set(profile.id, list);
      return map;
    });
  }

  // Build every talon for a week (comptabilisé + approved aperçu) and open one print
  // window with all of them (one page per employee) → a single PDF for the whole crew.
  function generateAll(weekKey) {
    setBatchMsg("");
    const week = weeks.find((w) => w.key === weekKey);
    if (!week) return;
    const items = [];
    for (const profile of rows) {
      const st = cellState(profile, week);
      // A comptabilisé week keeps its talon in the ledger: print that one, as the cell does.
      if (st.kind === "imported") { items.push({ kind: "kept", data: st.talon }); continue; }
      if (st.kind !== "comptabilise" && st.kind !== "apercu") continue;
      try {
        const opening = openingFor(profile.id, week.start);
        const talon = computeEmployeeWeekTalon({ profile, jobs: st.jobs, opening, frequency: "weekly", includePhone: true, includeStorage: true, weekDate: week.start.format("YYYY-MM-DD"), messierMethod: messier, holidayDates, employer, taxProfile: taxProfiles.get(profile.id), rounding: roundingFor(roundingByEmp, profile.id) });
        const model = buildStubModel({ result: talon.result, ytd: opening, pay: talon.pay, reimb: talon.reimb, ccq: talon.ccqAmounts });
        if (!model) continue;
        const ledgerRow = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key);
        const hdr = defaultHeader({ week: { start: week.start, end: week.end, weekNo: week.weekNo }, reference: formatTalonRef(ledgerRow?.talon_seq) });
        items.push({ kind: "stub", model, hdr, employee: profile, frequency: "weekly", official: !!ledgerRow?.boss_approved });
      } catch { /* skip an employee that fails to compute */ }
    }
    if (!items.length) { setBatchMsg(t("payroll.talon.batchNone")); return; }
    const ok = openTalonsPrint(items, `${t("payroll.subtabs.talon")} — S${week.weekNo}`);
    setBatchMsg(ok ? t("payroll.talon.batchDone", { count: items.length }) : t("payroll.talon.batchPopupBlocked"));
  }

  function Cell({ profile, week }) {
    const st = cellState(profile, week);
    if (st.kind === "none") return <span className="text-muted-foreground/40">·</span>;
    if (st.kind === "draft") return <span className="text-muted-foreground/60" title={t("payroll.talon.cell.draft")}>—</span>;
    if (st.kind === "pending") return <Clock className="mx-auto h-4 w-4 text-warning" title={t("payroll.talon.cell.pending")} />;
    if (st.kind === "imported") {
      return (
        <button
          type="button"
          onClick={() => printLegacyTalon(st.talon, `${t("payroll.subtabs.talon")} — S${week.weekNo} — ${profile.full_name || ""}`)}
          title={t("payroll.talon.cell.imported")}
          className="mx-auto flex h-9 w-9 items-center sm:h-7 sm:w-7 justify-center rounded-md text-info transition-colors hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileText className="h-4 w-4" strokeWidth={2.2} />
        </button>
      );
    }
    const official = st.kind === "official";
    const comptabilise = st.kind === "comptabilise";
    const cls = official
      ? "text-success hover:bg-success/10"
      : comptabilise
      ? "text-destructive hover:bg-destructive/10"
      : "text-muted-foreground hover:bg-accent";
    const title = official ? t("payroll.talon.cell.official") : comptabilise ? t("payroll.talon.cell.comptabilise") : t("payroll.talon.cell.apercu");
    return (
      <button
        type="button"
        onClick={() => openTalon(profile, week, st.jobs)}
        title={title}
        className={`mx-auto flex h-9 w-9 items-center sm:h-7 sm:w-7 justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cls}`}
      >
        {official
          ? <BadgeCheck className="h-4 w-4" strokeWidth={2.2} />
          : <FileText className={`h-4 w-4 ${comptabilise ? "" : "opacity-70"}`} strokeWidth={comptabilise ? 2.2 : 1.6} />}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("payroll.talon.title")}</b> {t("payroll.talon.matrixIntro")}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-success" strokeWidth={2.2} /> {t("payroll.talon.cell.official")}</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-destructive" strokeWidth={2.2} /> {t("payroll.talon.cell.comptabilise")}</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 opacity-70" strokeWidth={1.6} /> {t("payroll.talon.cell.apercu")}</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-info" strokeWidth={2.2} /> {t("payroll.talon.cell.imported")}</span>
        <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-warning" /> {t("payroll.talon.cell.pending")}</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> {t("payroll.legacy.title")}
        </Button>
      </div>

      <ImportLegacyStubsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        employees={payrollEmployees}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      {/* Batch: generate every talon for a week at once */}
      {!loading && weeks.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold">{t("payroll.talon.batchTitle")}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("payroll.talon.batchHint")}</p>
              {batchMsg && <p className="mt-1 text-xs text-muted-foreground">{batchMsg}</p>}
            </div>
            <div className="flex items-center gap-2">
              <select value={batchWeek} onChange={(e) => { setBatchWeek(e.target.value); setBatchMsg(""); }} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                {weeks.map((w) => (
                  <option key={w.key} value={w.key}>S{w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM YYYY")}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => generateAll(batchWeek)} disabled={!batchWeek}>
                <Printer className="mr-1.5 h-4 w-4" /> {t("payroll.talon.batchBtn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {error && <div className="px-4 py-3 text-xs text-destructive">{error}</div>}
          {loading && <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.working")}</div>}
          {/* Phone: one card per employee, the weeks that have a stub wrap onto several lines (no sideways scrolling). */}
          {!loading && (
            <div className="divide-y sm:hidden">
              {rows.map((profile) => {
                const shown = weeks.filter((w) => cellState(profile, w).kind !== "none");
                return (
                  <div key={profile.id} className="px-3 py-3">
                    <div className="mb-2 text-sm font-semibold">{profile.full_name || profile.id}</div>
                    <div className="grid grid-cols-5 gap-x-1 gap-y-2">
                      {shown.map((w) => (
                        <div key={w.key} className="flex flex-col items-center gap-0.5" title={`${w.start.format("DD MMM")}–${w.end.format("DD MMM YYYY")}`}>
                          <Cell profile={profile} week={w} />
                          <span className="text-xs font-medium text-muted-foreground">S{w.weekNo}</span>
                        </div>
                      ))}
                      {shown.length === 0 && <span className="col-span-5 text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("payroll.talon.noneApproved")}</div>}
            </div>
          )}
          {!loading && (
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left font-medium">{t("payroll.employee")}</th>
                    {weeks.map((w) => (
                      <th key={w.key} className="px-2 py-2.5 text-center font-medium" title={`${w.start.format("DD MMM")}–${w.end.format("DD MMM YYYY")}`}>
                        S{w.weekNo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((profile) => (
                    <tr key={profile.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">{profile.full_name || profile.id}</td>
                      {weeks.map((w) => (
                        <td key={w.key} className="px-2 py-2 text-center">
                          <Cell profile={profile} week={w} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={weeks.length + 1} className="px-3 py-6 text-center text-xs text-muted-foreground">{t("payroll.talon.noneApproved")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">{t("payroll.talon.disclaimer")}</p>
        </CardContent>
      </Card>

      {stub && (
        <PayStubPrint
          open={!!stub}
          onOpenChange={(o) => { if (!o) setStub(null); }}
          result={stub.talon.result}
          ytd={stub.opening}
          pay={stub.talon.pay}
          reimb={stub.talon.reimb}
          ccq={stub.talon.ccqAmounts}
          employee={stub.profile}
          frequency="weekly"
          week={stub.weekObj}
          reference={stub.reference}
          official={stub.official}
          canApproveOfficial={stub.canApprove}
          onToggleOfficial={toggleOfficial}
        />
      )}
    </div>
  );
}
