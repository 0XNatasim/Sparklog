import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { BadgeCheck, Clock, FileText, Printer, Upload } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeEmployeeWeekTalon, snapshotFromRow, formatTalonRef } from "@/payroll";
import { buildStubModel, defaultHeader, openStubsPrint } from "@/lib/paystub";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import { isOwnerRole, isNonCcqRole } from "@/lib/roles";
import { useAuth } from "@/contexts/AuthContext";
import PayStubPrint from "@/components/PayStubPrint";
import ImportLegacyStubsDialog from "@/components/ImportLegacyStubsDialog";
import { useT } from "@/lib/use-t";

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
  const t = useT();
  const { role } = useAuth();
  const isOwner = isOwnerRole(role); // only the boss (owner) can mark a talon official
  const [employees, setEmployees] = useState([]);
  const [jobsByEmp, setJobsByEmp] = useState(new Map());
  const [seedByEmp, setSeedByEmp] = useState(new Map());
  const [ledgerByEmp, setLedgerByEmp] = useState(new Map());
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
        const [{ data: profs, error: pErr }, { data: jobs, error: jErr }, { data: seeds }, { data: ledgers }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, overtime_first_hour_double, return_overtime_no_benefits").order("full_name", { ascending: true }),
          supabase.from("jobs").select("id, user_id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, status").gte("job_date", since),
          supabase.from("payroll_ytd").select("*").eq("tax_year", 2026),
          supabase.from("payroll_period_ledger").select("*").eq("tax_year", 2026).order("period_end", { ascending: true }),
        ]);
        if (pErr) throw pErr;
        if (jErr) throw jErr;
        if (cancelled) return;
        // Talons are a CCQ payroll artifact — subcontractors (billed by the trade) and other
        // non-CCQ roles never get one.
        setEmployees((profs || []).filter((e) => !isNonCcqRole(e.role)));

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

        const wk = [...weekMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, NB_WEEKS);
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

  // Employees that have at least one job in the window, in roster order.
  const rows = useMemo(() => employees.filter((e) => (jobsByEmp.get(e.id) || []).length > 0), [employees, jobsByEmp]);

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
      const talon = computeEmployeeWeekTalon({ profile, jobs, opening, frequency: "weekly", weekDate: week.start.format("YYYY-MM-DD"), messierMethod: messier });
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
      if (st.kind !== "comptabilise" && st.kind !== "apercu") continue;
      try {
        const opening = openingFor(profile.id, week.start);
        const talon = computeEmployeeWeekTalon({ profile, jobs: st.jobs, opening, frequency: "weekly", weekDate: week.start.format("YYYY-MM-DD"), messierMethod: messier });
        const model = buildStubModel({ result: talon.result, ytd: opening, pay: talon.pay, reimb: talon.reimb, ccq: talon.ccqAmounts });
        if (!model) continue;
        const ledgerRow = (ledgerByEmp.get(profile.id) || []).find((r) => r.period_end === week.key);
        const hdr = defaultHeader({ week: { start: week.start, end: week.end, weekNo: week.weekNo }, reference: formatTalonRef(ledgerRow?.talon_seq) });
        items.push({ model, hdr, employee: profile, frequency: "weekly", official: !!ledgerRow?.boss_approved });
      } catch { /* skip an employee that fails to compute */ }
    }
    if (!items.length) { setBatchMsg(t("payroll.talon.batchNone")); return; }
    const ok = openStubsPrint(items, `${t("payroll.subtabs.talon")} — S${week.weekNo}`);
    setBatchMsg(ok ? t("payroll.talon.batchDone", { count: items.length }) : t("payroll.talon.batchPopupBlocked"));
  }

  function Cell({ profile, week }) {
    const st = cellState(profile, week);
    if (st.kind === "none") return <span className="text-muted-foreground/40">·</span>;
    if (st.kind === "draft") return <span className="text-muted-foreground/60" title={t("payroll.talon.cell.draft")}>—</span>;
    if (st.kind === "pending") return <Clock className="mx-auto h-4 w-4 text-amber-500" title={t("payroll.talon.cell.pending")} />;
    const official = st.kind === "official";
    const comptabilise = st.kind === "comptabilise";
    const cls = official
      ? "text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
      : comptabilise
      ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
      : "text-muted-foreground hover:bg-accent";
    const title = official ? t("payroll.talon.cell.official") : comptabilise ? t("payroll.talon.cell.comptabilise") : t("payroll.talon.cell.apercu");
    return (
      <button
        type="button"
        onClick={() => openTalon(profile, week, st.jobs)}
        title={title}
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cls}`}
      >
        {official
          ? <BadgeCheck className="h-4 w-4" strokeWidth={2.2} />
          : <FileText className={`h-4 w-4 ${comptabilise ? "" : "opacity-70"}`} strokeWidth={comptabilise ? 2.2 : 1.6} />}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("payroll.talon.title")}</b> {t("payroll.talon.matrixIntro")}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-green-600 dark:text-green-400" strokeWidth={2.2} /> {t("payroll.talon.cell.official")}</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-red-600 dark:text-red-400" strokeWidth={2.2} /> {t("payroll.talon.cell.comptabilise")}</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 opacity-70" strokeWidth={1.6} /> {t("payroll.talon.cell.apercu")}</span>
        <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-amber-500" /> {t("payroll.talon.cell.pending")}</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> {t("payroll.legacy.title")}
        </Button>
      </div>

      <ImportLegacyStubsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        employees={employees}
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
              <select value={batchWeek} onChange={(e) => { setBatchWeek(e.target.value); setBatchMsg(""); }} className="rounded-md border bg-background px-2 py-1.5 text-sm">
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
          {!loading && (
            <div className="overflow-x-auto">
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
          <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">{t("payroll.talon.disclaimer")}</p>
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
