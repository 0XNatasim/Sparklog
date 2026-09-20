import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlertTriangle, CheckCircle2, Clock, FileText, Printer } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeEmployeeWeekTalon, snapshotFromRow } from "@/payroll";
import { weekEndingSaturdayD, weekStartSundayD, ccqWeekNumber } from "@/lib/ccq-week";
import PayStubPrint from "@/components/PayStubPrint";
import { useT } from "@/lib/use-t";

const money = (v) => `$${(Number(v) || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (v) => Number(v) || 0;

// The same "gross-up" totals PayStubPrint shows, so the summary card and the full stub
// agree to the cent. (Gains = cash + non-cash benefits + safety; Retenues = those
// benefits reversed + statutory + CCQ withholdings; Paie nette = Gains − Retenues.)
function stubTotals({ result, ccqAmounts, reimb }) {
  const g = result.gross, emp = result.employee;
  const cash = n(g.total);
  const reversals = n(ccqAmounts?.vacation) + n(ccqAmounts?.taxableBenefit) + n(ccqAmounts?.employerSocialBenefit);
  const safety = n(ccqAmounts?.safetyEquipment);
  const statutory = n(emp.federalTax) + n(emp.quebecTax) + n(emp.rrq?.total) + n(emp.ei) + n(emp.rqap);
  const withheld = statutory + n(ccqAmounts?.pensionDeduction) + n(ccqAmounts?.medicWithholding) + n(ccqAmounts?.unionDues) + n(ccqAmounts?.prelevementCcq) + n(ccqAmounts?.caisseEducationSyndicale);
  const grossUp = cash + reversals + safety;
  const totalRetenues = reversals + withheld;
  const net = grossUp - totalRetenues;
  const netPlusReimb = net + n(reimb?.km) + n(reimb?.phone);
  return { grossUp, totalRetenues, net, netPlusReimb };
}

// A job's status buckets. saved = draft (not yet part of payroll); submitted/updated =
// awaiting a manager decision; approved = pushed & counted.
const isPending = (s) => s === "submitted" || s === "updated";

// The CCQ week a date belongs to (Sunday → Saturday, keyed by the ending Saturday).
function ccqWeekOf(dateStr) {
  const end = weekEndingSaturdayD(dateStr);
  return { key: end.format("YYYY-MM-DD"), start: weekStartSundayD(dateStr), end };
}

// ── Talon (pay stub) preview sub-tab ─────────────────────────────────────────
// Live-recomputed talon for one employee + one CCQ week, shown BEFORE comptabilisation.
// Nothing is persisted here — the figures freeze only when a week is comptabilisée in
// the Calcul bench. The talon appears only once every hour of the week is approuvée.
export default function TalonTab() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [weeks, setWeeks] = useState([]); // [{key,start,end,weekNo,jobs,counts}]
  const [selectedWeek, setSelectedWeek] = useState("");
  const [opening, setOpening] = useState(null); // full YTD snapshot (dollars) for the selected week
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showStub, setShowStub] = useState(false);

  // Roster once. Non-fatal on error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, hourly_rate, km_rate, team_leader_premium, apprentice_level, union_association, employee_number, ccq_number, phone_data_reimbursement, overtime_first_hour_double, return_overtime_no_benefits")
        .order("full_name", { ascending: true });
      if (!cancelled) setEmployees(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const profile = useMemo(() => employees.find((e) => e.id === selectedId) || null, [employees, selectedId]);
  const week = useMemo(() => weeks.find((w) => w.key === selectedWeek) || null, [weeks, selectedWeek]);

  async function handleSelectEmployee(id) {
    setSelectedId(id);
    setSelectedWeek(""); setWeeks([]); setOpening(null); setError("");
    if (!id) return;
    setLoading(true);
    try {
      const since = dayjs().subtract(16, "week").format("YYYY-MM-DD");
      const { data: jobRows, error: jobErr } = await supabase
        .from("jobs")
        .select("id, job_date, depart, fin, km_total, km_aller, km_retour, return_time_minutes, status")
        .eq("user_id", id).gte("job_date", since).order("job_date", { ascending: false });
      if (jobErr) throw jobErr;
      const byWeek = new Map();
      (jobRows || []).forEach((j) => {
        const w = ccqWeekOf(j.job_date);
        if (!byWeek.has(w.key)) byWeek.set(w.key, { ...w, weekNo: ccqWeekNumber(w.end), jobs: [] });
        byWeek.get(w.key).jobs.push(j);
      });
      const opts = [...byWeek.values()].map((w) => {
        const counts = { approved: 0, pending: 0, saved: 0 };
        w.jobs.forEach((j) => {
          if (j.status === "approved") counts.approved += 1;
          else if (isPending(j.status)) counts.pending += 1;
          else counts.saved += 1;
        });
        return { ...w, counts };
      }).sort((a, b) => (a.key < b.key ? 1 : -1));
      setWeeks(opts);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // Opening balance = the latest ledger snapshot ending BEFORE the week starts, else the
  // pre-SparkLog seed (payroll_ytd). Loaded on week selection.
  async function loadOpening(w) {
    setOpening(null);
    const [{ data: seedRow }, { data: ledgerRows }] = await Promise.all([
      supabase.from("payroll_ytd").select("*").eq("user_id", selectedId).eq("tax_year", 2026).maybeSingle(),
      supabase.from("payroll_period_ledger").select("*").eq("user_id", selectedId).eq("tax_year", 2026).order("period_end", { ascending: true }),
    ]);
    const before = (ledgerRows || [])
      .filter((r) => r.period_end && dayjs(r.period_end).isBefore(w.start))
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
    const row = before[0] || seedRow || null;
    setOpening(snapshotFromRow(row));
  }

  async function handleSelectWeek(key) {
    setSelectedWeek(key); setOpening(null); setError("");
    if (!key) return;
    const w = weeks.find((o) => o.key === key);
    if (!w) return;
    setLoading(true);
    try {
      await loadOpening(w);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // The live talon — only when the week is fully approved and the opening is loaded.
  const ready = week && week.counts.pending === 0 && week.counts.approved > 0;
  const talon = useMemo(() => {
    if (!ready || !profile || !opening) return null;
    const approvedJobs = week.jobs.filter((j) => j.status === "approved");
    try {
      return computeEmployeeWeekTalon({ profile, jobs: approvedJobs, opening, frequency: "weekly" });
    } catch {
      return null;
    }
  }, [ready, profile, opening, week]);

  const totals = talon ? stubTotals(talon) : null;
  const weekObj = week ? { start: week.start, end: week.end, weekNo: week.weekNo } : null;

  return (
    <div className="space-y-3">
      {/* Preview banner */}
      <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>{t("payroll.talon.title")}</b> {t("payroll.talon.intro")}</div>
        </div>
      </div>

      {/* Employee + week picker */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("payroll.employee")}</span>
              <select value={selectedId} onChange={(e) => handleSelectEmployee(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="">{t("payroll.talon.pickEmployee")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}{e.role && e.role !== "employee" ? ` · ${e.role}` : ""}</option>)}
              </select>
            </label>
            {selectedId && (
              <label className="block text-xs">
                <span className="text-muted-foreground">{t("payroll.weekSelect")}</span>
                <select value={selectedWeek} onChange={(e) => handleSelectWeek(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                  <option value="">{t("payroll.talon.pickWeek")}</option>
                  {weeks.map((w) => (
                    <option key={w.key} value={w.key}>
                      {t("manager.weekShort")} {w.weekNo} · {w.start.format("DD MMM")}–{w.end.format("DD MMM")} · {w.counts.pending === 0 && w.counts.approved > 0 ? "✓" : "⏳"} {w.counts.approved}/{w.counts.approved + w.counts.pending}
                    </option>
                  ))}
                  {weeks.length === 0 && <option value="" disabled>{t("payroll.weekNone")}</option>}
                </select>
              </label>
            )}
          </div>
          {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
          {loading && <div className="mt-3 text-xs text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {/* Week status / guard */}
      {week && !loading && (
        <>
          {week.counts.pending > 0 && (
            <Card>
              <CardContent className="flex items-start gap-2 p-4 text-sm">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <b>{t("payroll.talon.pendingTitle")}</b>
                  <div className="mt-1 text-xs text-muted-foreground">{t("payroll.talon.pendingBody", { pending: week.counts.pending, approved: week.counts.approved })}</div>
                </div>
              </CardContent>
            </Card>
          )}
          {week.counts.pending === 0 && week.counts.approved === 0 && (
            <Card>
              <CardContent className="flex items-start gap-2 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">{t("payroll.talon.noneApproved")}</div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* The live talon preview */}
      {ready && talon && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold">{profile.full_name}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">{t("payroll.talon.previewBadge")}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowStub(true)}>
                <Printer className="mr-1.5 h-4 w-4" /> {t("payroll.talon.openStub")}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [t("payroll.talon.gross"), money(totals.grossUp), "text-green-700 dark:text-green-400"],
                [t("payroll.talon.deductions"), money(totals.totalRetenues), "text-red-600 dark:text-red-400"],
                [t("payroll.talon.net"), money(totals.net), ""],
              ].map(([lbl, val, tc], i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{lbl}</div>
                  <div className={`font-mono text-base font-bold ${tc}`}>{val}</div>
                </div>
              ))}
            </div>
            {totals.netPlusReimb !== totals.net && (
              <div className="mt-2 text-right text-xs text-muted-foreground">
                {t("payroll.talon.deposited")} <span className="font-mono font-semibold text-foreground">{money(totals.netPlusReimb)}</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("payroll.regularHours")}</span><span className="font-mono">{talon.hours.regularHours.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("payroll.ot150Hours")}</span><span className="font-mono">{talon.hours.ot150Hours.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("payroll.ot200Hours")}</span><span className="font-mono">{talon.hours.ot200Hours.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("payroll.returnNbHours")}</span><span className="font-mono">{talon.hours.returnNbHours.toFixed(2)}</span></div>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">{t("payroll.talon.disclaimer")}</p>
          </CardContent>
        </Card>
      )}

      {ready && talon && (
        <PayStubPrint
          open={showStub}
          onOpenChange={setShowStub}
          result={talon.result}
          ytd={opening}
          pay={talon.pay}
          reimb={talon.reimb}
          ccq={talon.ccqAmounts}
          employee={profile}
          frequency="weekly"
          week={weekObj}
        />
      )}
    </div>
  );
}
