import React, { useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { Files } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { withRetry } from "@/lib/utils";
import { chainHoursFromPrevious } from "@/lib/talon-import-core";
import { batchRowIssues, ledgerPayloadFor, matchStubEmployee } from "@/lib/talon-batch";

const money = (v) => (v == null || v === "" ? "—" : `${Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const clone = (value) => JSON.parse(JSON.stringify(value));

// Several old pay stubs at once (e.g. every employee's last stub before Sparklog): each PDF is read
// in the browser, its employee recognised from the name printed on it (changeable), then every
// ready row is saved exactly like the one-by-one import below.
export default function ImportStubsBatch({ employees, onSaved }) {
  const t = useT();
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");

  async function handleFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setSummary("");
    const { parseFullTalon } = await import("@/lib/talon-import-parse");
    const parsed = [];
    for (const [index, file] of files.entries()) {
      setProgress(t("payroll.legacyBatch.reading", { current: index + 1, total: files.length }));
      try {
        const talon = await parseFullTalon(file);
        const match = matchStubEmployee(talon.header, employees);
        parsed.push({ key: `${file.name}-${index}`, fileName: file.name, talon, userId: match.userId, how: match.how, periodEnd: talon.periodEnd || "", status: "ready" });
      } catch (err) {
        parsed.push({ key: `${file.name}-${index}`, fileName: file.name, error: err?.code === "no_text_layer" ? t("payroll.legacy.noText") : (err?.message || t("payroll.legacy.failed")), status: "ready" });
      }
    }
    // Weeks already in the register, to warn before replacing one.
    const ids = [...new Set(parsed.map((r) => r.userId).filter(Boolean))];
    const { data: existing } = ids.length
      ? await supabase.from("payroll_period_ledger").select("user_id, period_end").in("user_id", ids)
      : { data: [] };
    const taken = new Set((existing || []).map((r) => `${r.user_id}|${r.period_end}`));
    setRows(parsed.map((r) => ({ ...r, replaces: taken.has(`${r.userId}|${r.periodEnd}`) })));
    setProgress("");
    setBusy(false);
  }

  const setEmployee = (key, userId) => setRows((list) => list.map((r) => (r.key === key ? { ...r, userId, how: userId ? "manual" : "none" } : r)));
  const issuesOf = (row) => batchRowIssues(row, rows);
  const ready = useMemo(() => rows.filter((r) => r.status !== "saved" && !batchRowIssues(r, rows).length), [rows]);

  async function saveAll() {
    if (!ready.length) return;
    setBusy(true); setSummary("");
    let saved = 0;
    let failed = 0;
    // Oldest week first, so several weeks of one employee chain their hours in order.
    for (const row of [...ready].sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)))) {
      try {
        // Hours: chain from the employee's previous week in the register when there is one (same
        // rule as the one-by-one import).
        const talon = clone(row.talon);
        const { data: previous } = await supabase.from("payroll_period_ledger")
          .select("period_end, hours_ytd").eq("user_id", row.userId).lt("period_end", row.periodEnd)
          .not("hours_ytd", "is", null).order("period_end", { ascending: false }).limit(1);
        if (previous?.[0]) chainHoursFromPrevious(talon, previous[0].hours_ytd);
        const payload = ledgerPayloadFor({ userId: row.userId, talon, periodEnd: row.periodEnd });
        const { error } = await withRetry(() => supabase.from("payroll_period_ledger").upsert(payload, { onConflict: "user_id,period_end" }), 15000);
        if (error) throw error;
        saved += 1;
        setRows((list) => list.map((r) => (r.key === row.key ? { ...r, status: "saved", saveError: "" } : r)));
      } catch (err) {
        failed += 1;
        setRows((list) => list.map((r) => (r.key === row.key ? { ...r, status: "failed", saveError: err?.message || String(err) } : r)));
      }
    }
    setSummary(t("payroll.legacyBatch.done", { saved, failed }));
    setBusy(false);
    if (saved) onSaved?.();
  }

  const statusText = (row) => {
    if (row.status === "saved") return <span className="text-success">{t("payroll.legacyBatch.saved")}</span>;
    if (row.status === "failed") return <span className="text-destructive">{row.saveError}</span>;
    if (row.error) return <span className="text-destructive">{row.error}</span>;
    const issues = issuesOf(row);
    if (issues.length) return <span className="text-destructive">{issues.map((code) => t(`payroll.legacyBatch.issue.${code}`)).join(" · ")}</span>;
    const notes = [];
    if (row.how === "number") notes.push(t("payroll.legacyBatch.byNumber"));
    if (row.replaces) notes.push(t("payroll.legacyBatch.replaces"));
    return notes.length ? <span className="text-warning">{notes.join(" · ")}</span> : <span className="text-success">{t("payroll.legacyBatch.ok")}</span>;
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{t("payroll.legacyBatch.title")}</div>
          <div className="text-xs text-muted-foreground">{t("payroll.legacyBatch.hint")}</div>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFiles} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Files className="mr-2 h-4 w-4" />{t("payroll.legacyBatch.choose")}
        </Button>
      </div>
      {progress && <p className="text-xs text-muted-foreground">{progress}</p>}

      {rows.length > 0 && (
        <>
          <div className="max-h-80 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-2 py-1">{t("payroll.legacyBatch.col.file")}</th>
                  <th className="px-2 py-1">{t("payroll.legacyBatch.col.stubName")}</th>
                  <th className="px-2 py-1">{t("payroll.legacyBatch.col.week")}</th>
                  <th className="px-2 py-1">{t("payroll.legacyBatch.col.employee")}</th>
                  <th className="px-2 py-1 text-right">{t("payroll.legacyBatch.col.cumul")}</th>
                  <th className="px-2 py-1">{t("payroll.legacyBatch.col.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.key} className="align-top">
                    <td className="max-w-[10rem] truncate px-2 py-1" title={row.fileName}>{row.fileName}</td>
                    <td className="px-2 py-1">{row.talon?.header?.name || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1">{row.periodEnd ? `${t("payroll.legacyBatch.weekEnding")} ${dayjs(row.periodEnd).format("D MMM YYYY")}` : "—"}</td>
                    <td className="px-2 py-1">
                      {!row.error && (
                        <select value={row.userId} disabled={busy || row.status === "saved"} onChange={(e) => setEmployee(row.key, e.target.value)}
                          className="w-full min-w-[9rem] rounded border border-input bg-background px-1 py-0.5">
                          <option value="">{t("payroll.legacyBatch.pickEmployee")}</option>
                          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name || emp.id}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{money(row.talon?.ytd?.pensionableIncomeRRQ)}</td>
                    <td className="px-2 py-1">{statusText(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{summary || t("payroll.legacyBatch.readyCount", { ready: ready.length, total: rows.length })}</span>
            <Button type="button" size="sm" disabled={busy || !ready.length} onClick={saveAll}>
              {busy ? t("common.working") : t("payroll.legacyBatch.saveAll", { count: ready.length })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
