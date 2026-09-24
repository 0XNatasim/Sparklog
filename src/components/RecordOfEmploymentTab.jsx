import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { Printer, Upload, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculateDailyTotals, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { EMPLOYER } from "@/lib/paystub";
import { useT } from "@/lib/use-t";

// Weekly payroll → the ROE reports up to the last 53 pay periods (Service Canada rule for
// a weekly pay period, both for Block 15A hours and Block 15C per-period earnings).
const ROE_MAX_WEEKLY_PERIODS = 53;

// Block 16 — reason for issuing the ROE. Codes are Service Canada's; a layoff (licenciement)
// is code A. Labels stay in French to match the ROE / talon documents.
const SEPARATION_REASONS = [
  { code: "A", label: "Manque de travail / fin de saison ou de contrat (licenciement)" },
  { code: "B", label: "Grève ou lock-out" },
  { code: "D", label: "Maladie ou blessure" },
  { code: "E", label: "Départ volontaire (démission)" },
  { code: "F", label: "Congé de maternité" },
  { code: "G", label: "Retraite" },
  { code: "H", label: "Travail partagé" },
  { code: "M", label: "Congédiement" },
  { code: "N", label: "Congé" },
  { code: "Z", label: "Congé parental (partage des prestations)" },
  { code: "K", label: "Autre" },
];

const money = (n) => (Number(n) || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const hrs = (n) => (Number(n) || 0).toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Insurable hours actually worked within [start, end] (inclusive), using the same engine
// as the "Vue semaine" tab so the figures match what the employee sees.
function insurableHoursInRange(jobs, start, end, otOptions) {
  const inRange = (jobs || []).filter((j) => j.job_date >= start && j.job_date <= end);
  if (!inRange.length) return 0;
  const daily = calculateDailyTotals(inRange, otOptions);
  let minutes = 0;
  for (const d of daily.values()) {
    minutes += d.regularWorkMinutes + d.returnRegularMinutes + d.overtime50Minutes + d.overtime100Minutes + d.returnNoBenefitMinutes;
  }
  return minutes / 60;
}

// ── Relevé d'emploi (Testing) ────────────────────────────────────────────────
// Compiles the Service Canada Record of Employment figures for a laid-off employee:
// insurable earnings come from the accounted pay ledger (payroll_period_ledger), insurable
// hours are derived from the time entries, and the key ROE dates/blocks are computed. Prints
// a preparation sheet the payroll admin transcribes into ROE Web (this is not the official form).
export default function RecordOfEmploymentTab() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("A");
  const [recall, setRecall] = useState("");
  const [ledger, setLedger] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importRows, setImportRows] = useState([]); // parsed prior-stub previews awaiting save
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);

  // Employee roster (CCQ employees only — the people an ROE is ever issued for).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error: e } = await supabase
          .from("profiles")
          .select("id, full_name, employee_number, ccq_number, role, overtime_first_hour_double, return_overtime_no_benefits")
          .eq("role", "employee")
          .order("full_name", { ascending: true });
        if (e) throw e;
        if (cancelled) return;
        setEmployees(data || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Prior-stub history (weeks before SparkLog) for the selected employee.
  const loadHistory = useCallback(async () => {
    if (!selectedId) { setHistory([]); return; }
    const { data, error: e } = await supabase
      .from("roe_history")
      .select("id, period_start, period_end, insurable_earnings, insurable_hours, source_file")
      .eq("user_id", selectedId)
      .order("period_end", { ascending: true });
    if (e) { setError(e.message); return; }
    setHistory(data || []);
  }, [selectedId]);

  // Pay ledger + time entries for the selected employee.
  useEffect(() => {
    if (!selectedId) { setLedger([]); setJobs([]); setHistory([]); setImportRows([]); return; }
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError("");
      setImportRows([]);
      try {
        const [{ data: led, error: le }, { data: jb, error: je }] = await Promise.all([
          supabase
            .from("payroll_period_ledger")
            .select("period_start, period_end, insurable_income_ei, gross_income, vacation_pay, vacances_ccq")
            .eq("user_id", selectedId)
            .order("period_end", { ascending: true }),
          supabase
            .from("jobs")
            .select("job_date, depart, fin, ot, km_total, km_aller, km_retour, return_time_minutes")
            .eq("user_id", selectedId)
            .order("job_date", { ascending: true }),
        ]);
        if (le) throw le;
        if (je) throw je;
        if (cancelled) return;
        setLedger(led || []);
        setJobs(jb || []);
        await loadHistory();
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, loadHistory]);

  const employee = useMemo(() => employees.find((e) => e.id === selectedId) || null, [employees, selectedId]);

  // The compiled ROE model: per-period rows (most recent first), totals, and key dates.
  const roe = useMemo(() => {
    if (!employee || (ledger.length === 0 && history.length === 0)) return null;
    const otOptions = overtimeOptionsFromProfile(employee);
    // Accounted SparkLog pay + imported prior-stub history, keyed by pay-period end (Saturday).
    const byEnd = new Map(ledger.map((r) => [r.period_end, r]));
    const histByEnd = new Map(history.map((r) => [r.period_end, r]));

    const firstJob = jobs[0]?.job_date || null;
    const lastJob = jobs.length ? jobs[jobs.length - 1].job_date : null;
    const starts = [ledger[0]?.period_start, history[0]?.period_start, firstJob].filter(Boolean).sort();
    const firstDay = starts[0] || null;
    const ends = [ledger[ledger.length - 1]?.period_end, history[history.length - 1]?.period_end, lastJob].filter(Boolean).sort();
    const finalPeriodEnd = ledger[ledger.length - 1]?.period_end || ends[ends.length - 1] || null;
    const lastDay = lastJob || finalPeriodEnd;

    // Annexe D: report CONSECUTIVE weekly pay periods, counting back from the final pay
    // period, up to 53 for a weekly pay. Weeks with no pay are still reported at 0.00 (they
    // are part of the consecutive series), and we stop at the first day worked. Each week's
    // figures come from the SparkLog ledger, else the imported prior-stub history, else 0.
    const rows = [];
    let end = finalPeriodEnd ? dayjs(finalPeriodEnd) : null;
    for (let i = 0; end && i < ROE_MAX_WEEKLY_PERIODS; i++) {
      if (firstDay && end.isBefore(dayjs(firstDay), "day")) break; // before employment start
      const endStr = end.format("YYYY-MM-DD");
      const startStr = end.subtract(6, "day").format("YYYY-MM-DD");
      const row = byEnd.get(endStr);
      const hist = histByEnd.get(endStr);
      let earnings = 0;
      let hours = 0;
      if (row) {
        earnings = Number(row.insurable_income_ei || 0);
        hours = insurableHoursInRange(jobs, startStr, endStr, otOptions);
      } else if (hist) {
        earnings = Number(hist.insurable_earnings || 0);
        hours = Number(hist.insurable_hours || 0);
      }
      rows.push({
        start: startStr,
        end: endStr,
        earnings,
        hours,
        vacation: row ? Number(row.vacation_pay || 0) + Number(row.vacances_ccq || 0) : 0,
      });
      end = end.subtract(7, "day"); // previous weekly period (stays a Saturday)
    }
    // rows are already most-recent-first (Block 15C order).
    const totalHours = rows.reduce((s, p) => s + p.hours, 0);
    const totalEarnings = rows.reduce((s, p) => s + p.earnings, 0);
    const vacationFinal = rows.length ? rows[0].vacation : 0;

    return { rows, totalHours, totalEarnings, vacationFinal, firstDay, lastDay, finalPeriodEnd };
  }, [employee, ledger, jobs, history]);

  const reasonLabel = SEPARATION_REASONS.find((r) => r.code === reason)?.label || "";

  // ── Prior pay stubs (before SparkLog) — PDF import to build the ROE history ──────────
  async function handleHistoryImport(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !selectedId) return;
    setImporting(true);
    setError("");
    try {
      const { parseHistoricalPayStub } = await import("@/lib/paystub-parse");
      const parsed = [];
      for (const file of files) {
        try {
          const r = await parseHistoricalPayStub(file);
          const ok = Boolean(r.periodEnd) && r.insurableEarnings != null;
          parsed.push({
            file: file.name,
            periodEnd: r.periodEnd || "",
            earnings: r.insurableEarnings != null ? Number(r.insurableEarnings) : null,
            hours: r.insurableHours != null ? Number(r.insurableHours) : null,
            ok,
          });
        } catch (err) {
          parsed.push({ file: file.name, periodEnd: "", earnings: null, hours: null, ok: false, error: err?.code === "no_text_layer" ? t("testing.roe.hist.noText") : (err?.message || "") });
        }
      }
      setImportRows((prev) => [...prev, ...parsed]);
    } finally {
      setImporting(false);
    }
  }

  async function saveImportRows() {
    const ready = importRows.filter((r) => r.ok && r.periodEnd);
    if (!ready.length || !selectedId) return;
    setImporting(true);
    setError("");
    try {
      const payload = ready.map((r) => {
        const end = dayjs(r.periodEnd);
        return {
          user_id: selectedId,
          tax_year: end.year(),
          period_start: end.subtract(6, "day").format("YYYY-MM-DD"),
          period_end: end.format("YYYY-MM-DD"),
          insurable_earnings: Number(r.earnings || 0),
          insurable_hours: Number(r.hours || 0),
          source_file: r.file || null,
        };
      });
      const { error: e } = await supabase.from("roe_history").upsert(payload, { onConflict: "user_id,period_end" });
      if (e) throw e;
      setImportRows([]);
      await loadHistory();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setImporting(false);
    }
  }

  async function removeHistory(id) {
    const { error: e } = await supabase.from("roe_history").delete().eq("id", id);
    if (e) { setError(e.message); return; }
    await loadHistory();
  }

  function handlePrint() {
    if (!employee || !roe) return;
    const w = window.open("", "_blank", "width=820,height=1060");
    if (!w) { setError(t("testing.roe.popupBlocked")); return; }
    w.document.open();
    w.document.write(buildRoeHtml({ employee, roe, reasonCode: reason, reasonLabel, recall }));
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* onload handles it */ } }, 500);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">{t("testing.roe.employee")}</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t("testing.roe.employeePlaceholder")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
              {employees.length === 0 && <option value="" disabled>{t("testing.roe.employeeNone")}</option>}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">{t("testing.roe.reason")}</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {SEPARATION_REASONS.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.label}</option>)}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">{t("testing.roe.recall")}</span>
            <input
              type="date"
              value={recall}
              onChange={(e) => setRecall(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end">
            <Button onClick={handlePrint} disabled={!roe || busy} className="w-full sm:w-auto">
              <Printer className="mr-2 h-4 w-4" />{t("testing.roe.generate")}
            </Button>
          </div>
          {error && <div className="text-xs text-destructive sm:col-span-2">{error}</div>}
          {loading && <div className="text-xs text-muted-foreground sm:col-span-2">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t("testing.roe.hist.title")}</div>
              <input ref={importInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleHistoryImport} />
              <Button size="sm" variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />{importing ? t("common.working") : t("testing.roe.hist.import")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("testing.roe.hist.hint")}</p>

            {importRows.length > 0 && (
              <div className="space-y-1">
                {importRows.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm ${r.ok ? "" : "border-destructive/40 bg-destructive/5"}`}>
                    <span className="min-w-0 truncate">{r.file}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {r.ok ? (
                        <>
                          <span>{r.periodEnd}</span>
                          <span className="font-mono">{money(r.earnings || 0)}</span>
                          <span className="font-mono">{hrs(r.hours || 0)} h</span>
                        </>
                      ) : (
                        <span className="text-destructive">{r.error || t("testing.roe.hist.unreadable")}</span>
                      )}
                      <button type="button" onClick={() => setImportRows((prev) => prev.filter((_, j) => j !== i))} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                    </span>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <Button size="sm" disabled={importing || !importRows.some((r) => r.ok)} onClick={saveImportRows}>{t("testing.roe.hist.save")}</Button>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">{t("testing.roe.hist.saved")}</div>
                <div className="divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span>{dayjs(h.period_start).format("DD MMM")} – {dayjs(h.period_end).format("DD MMM YYYY")}</span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className="font-mono">{money(h.insurable_earnings)}</span>
                        <span className="font-mono">{hrs(h.insurable_hours)} h</span>
                        <button type="button" onClick={() => removeHistory(h.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedId && !busy && ledger.length === 0 && history.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("testing.roe.noLedger")}</CardContent></Card>
      )}

      {roe && (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t("testing.roe.periodType")} value={t("testing.roe.weekly")} />
              <Field label={t("testing.roe.firstDay")} value={roe.firstDay ? dayjs(roe.firstDay).format("YYYY-MM-DD") : "—"} />
              <Field label={t("testing.roe.lastDay")} value={roe.lastDay ? dayjs(roe.lastDay).format("YYYY-MM-DD") : "—"} />
              <Field label={t("testing.roe.finalPeriodEnd")} value={roe.finalPeriodEnd ? dayjs(roe.finalPeriodEnd).format("YYYY-MM-DD") : "—"} />
              <Field label={t("testing.roe.totalHours")} value={hrs(roe.totalHours)} strong />
              <Field label={t("testing.roe.totalEarnings")} value={money(roe.totalEarnings)} strong />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">{t("testing.roe.perPeriod")}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">{t("testing.roe.colPeriod")}</th>
                      <th className="px-4 py-2.5 font-medium text-right">{t("testing.roe.colHours")}</th>
                      <th className="px-4 py-2.5 font-medium text-right">{t("testing.roe.colEarnings")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roe.rows.map((p, i) => (
                      <tr key={p.end} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2">{dayjs(p.start).format("DD MMM")} – {dayjs(p.end).format("DD MMM YYYY")}</td>
                        <td className="px-4 py-2 text-right font-mono">{hrs(p.hours)}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(p.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-primary/5 font-semibold">
                      <td className="px-4 py-2.5" colSpan={2}>{t("testing.roe.window")}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{hrs(roe.totalHours)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{money(roe.totalEarnings)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="px-1 text-xs text-muted-foreground">{t("testing.roe.disclaimer")}</p>
        </>
      )}
    </div>
  );
}

function Field({ label, value, strong }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={strong ? "font-mono font-semibold" : "font-mono"}>{value}</span>
    </div>
  );
}

// Standalone printable preparation sheet (French, A4 portrait) mirroring the talon print flow.
function buildRoeHtml({ employee, roe, reasonCode, reasonLabel, recall }) {
  const today = dayjs().format("YYYY-MM-DD");
  const rowsHtml = roe.rows.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${dayjs(p.start).format("YYYY-MM-DD")} – ${dayjs(p.end).format("YYYY-MM-DD")}</td>
      <td class="num">${hrs(p.hours)}</td>
      <td class="num">${money(p.earnings)}</td>
    </tr>`).join("");

  const block = (n, label, value) => `
    <div class="block">
      <div class="bl-label"><span class="bl-num">${n}</span>${esc(label)}</div>
      <div class="bl-val">${esc(value)}</div>
    </div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Relevé d'emploi — ${esc(employee.full_name || "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 12px; }
  .sheet { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #555; font-size: 11px; margin: 0 0 16px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
  .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 0 0 6px; }
  .card .line { margin: 2px 0; }
  .blocks { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .block { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
  .bl-label { font-size: 10px; color: #666; }
  .bl-num { display: inline-block; min-width: 26px; font-weight: 700; color: #111; }
  .bl-val { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border-bottom: 1px solid #ddd; padding: 5px 8px; text-align: left; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #999; }
  .sec { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 16px 0 0; }
  .foot { margin-top: 16px; font-size: 10px; color: #666; line-height: 1.5; border-top: 1px solid #ddd; padding-top: 8px; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="sheet">
  <h1>Relevé d'emploi — feuille de préparation</h1>
  <p class="sub">Données pour Service Canada (ROE Web) · générée le ${today}. Ce document n'est pas le relevé d'emploi officiel : reportez ces valeurs dans ROE Web.</p>

  <div class="parties">
    <div class="card">
      <h2>Employeur</h2>
      <div class="line"><b>${esc(EMPLOYER)}</b></div>
    </div>
    <div class="card">
      <h2>Employé</h2>
      <div class="line"><b>${esc(employee.full_name || "")}</b></div>
      <div class="line">N° d'employé : ${esc(employee.employee_number || "—")}</div>
      <div class="line">N° CCQ : ${esc(employee.ccq_number || "—")}</div>
      <div class="line">NAS : ____________________</div>
    </div>
  </div>

  <div class="blocks">
    ${block("6", "Type de période de paie", "Hebdomadaire")}
    ${block("10", "Premier jour travaillé", roe.firstDay ? dayjs(roe.firstDay).format("YYYY-MM-DD") : "—")}
    ${block("11", "Dernier jour payé", roe.lastDay ? dayjs(roe.lastDay).format("YYYY-MM-DD") : "—")}
    ${block("12", "Fin de la dernière période de paie", roe.finalPeriodEnd ? dayjs(roe.finalPeriodEnd).format("YYYY-MM-DD") : "—")}
    ${block("16", "Raison du relevé", `${reasonCode} — ${reasonLabel}`)}
    ${block("14", "Rappel prévu", recall ? dayjs(recall).format("YYYY-MM-DD") : "Aucun / Inconnu")}
    ${block("15A", "Total des heures assurables", hrs(roe.totalHours))}
    ${block("15B", "Total de la rémunération assurable", money(roe.totalEarnings))}
    ${block("17A", "Paie de vacances (dernière période)", money(roe.vacationFinal))}
  </div>

  <p class="sec">15C — Rémunération assurable par période de paie (la plus récente en premier)</p>
  <table>
    <thead><tr><th>#</th><th>Période de paie</th><th class="num">Heures assurables</th><th class="num">Rémunération assurable</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="2">Total (max. 53 périodes — paie hebdomadaire)</td><td class="num">${hrs(roe.totalHours)}</td><td class="num">${money(roe.totalEarnings)}</td></tr></tfoot>
  </table>

  <div class="foot">
    Rémunération assurable issue de la paie comptabilisée (assurance-emploi). Heures assurables calculées à partir des feuilles de temps
    (heures réellement travaillées, temps supplémentaire inclus). Selon l'Annexe D de Service Canada : jusqu'à 53 périodes de paie
    hebdomadaires <b>consécutives</b>, comptées à rebours depuis la dernière période payée — les semaines sans paie sont incluses à 0,00 $.
    Vérifiez les montants et complétez le NAS et l'adresse dans ROE Web avant l'émission. Ce document ne remplace pas le relevé d'emploi officiel de Service Canada.
  </div>
</div></body></html>`;
}
