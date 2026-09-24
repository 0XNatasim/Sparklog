import React, { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Upload, Printer } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";
import { withRetry } from "@/lib/utils";
import { EMPTY_YTD, YTD_STATUTORY, CCQ_CUMUL, snapshotToLedgerColumns, ledgerRowToSnapshot } from "@/lib/payroll-ledger-fields";
import { legacyTalonSheet, legacyTalonDocument, printLegacyTalon } from "@/lib/legacy-talon-render";

const money = (v) => `$${(Number(v) || 0).toFixed(2)}`;
// CCQ week (Sun→Sat) start from the ending Saturday date string.
const weekStartFromEnd = (endStr) => dayjs(endStr).subtract(6, "day").format("YYYY-MM-DD");

// Render the reconstructed talon in the ORIGINAL layout, isolated in an iframe so its
// generic table/body CSS never bleeds into the app.
function TalonPreview({ talon }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !talon) return;
    el.srcdoc = legacyTalonDocument([legacyTalonSheet(talon)]);
  }, [talon]);
  return <iframe ref={ref} title="talon-preview" className="h-[520px] w-full rounded-md border bg-white" />;
}

// Import an OLD pay stub (PDF) → parse the FULL talon (header + Transactions + Sommaire
// Période/Cumulatif) in the original layout → validate → insert the week into the pay ledger.
// The ledger row stores the "Cumulatif" figures (for the chain / Record of Employment) AND the
// full talon JSON (imported_talon) so the past stub can be reproduced exactly. Upsert by
// (user, period_end) — re-importing a week corrects it.
export default function ImportLegacyStubsDialog({ open, onOpenChange, employees, onSaved }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState("");
  const [talon, setTalon] = useState(null); // { header, transactions, sommaire, ytd, periodEnd }
  const [snapshot, setSnapshot] = useState(null); // editable YTD object (Cumulatif) once parsed
  const [periodEnd, setPeriodEnd] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [existing, setExisting] = useState([]);

  useEffect(() => { if (!open) { setSelectedId(""); resetParse(); } }, [open]);
  useEffect(() => { if (selectedId) loadExisting(); else setExisting([]); /* eslint-disable-next-line */ }, [selectedId]);

  function resetParse() { setTalon(null); setSnapshot(null); setPeriodEnd(""); setFileName(""); setMsg(""); setErr(""); }

  async function loadExisting() {
    const { data } = await supabase
      .from("payroll_period_ledger")
      .select("period_start, period_end, insurable_income_ei, hours_ytd, talon_seq, imported_talon")
      .eq("user_id", selectedId)
      .order("period_end", { ascending: false });
    setExisting(data || []);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    setParsing(true); setErr(""); setMsg(""); setTalon(null); setSnapshot(null);
    try {
      const { parseFullTalon } = await import("@/lib/talon-import-parse");
      const result = await parseFullTalon(file);
      setTalon(result);
      setSnapshot({ ...EMPTY_YTD, ...(result.ytd || {}) });
      setPeriodEnd(result.periodEnd || result.header?.periodEnd || "");
      setFileName(file.name);
      const n = (result.transactions?.length || 0) + (result.sommaire?.length || 0);
      setMsg(t("payroll.legacy.detected", { count: n }));
    } catch (e2) {
      setErr(e2?.code === "no_text_layer" ? t("payroll.legacy.noText") : (e2?.message || t("payroll.legacy.failed")));
    } finally {
      setParsing(false);
    }
  }

  const setField = (k) => (v) => setSnapshot((s) => ({ ...s, [k]: v }));

  async function insertWeek() {
    if (!selectedId || !snapshot || !periodEnd) { setErr(t("payroll.legacy.needDate")); return; }
    setSaving(true); setErr(""); setMsg("");
    try {
      const period_end = dayjs(periodEnd).format("YYYY-MM-DD");
      // Keep the parsed header's period aligned with the (possibly edited) end date.
      const importedTalon = talon
        ? { header: { ...talon.header, periodEnd: period_end, periodStart: weekStartFromEnd(period_end) }, transactions: talon.transactions || [], sommaire: talon.sommaire || [] }
        : null;
      const payload = {
        user_id: selectedId,
        tax_year: dayjs(period_end).year(),
        period_end,
        period_start: weekStartFromEnd(period_end),
        ...snapshotToLedgerColumns(snapshot),
        imported_talon: importedTalon,
      };
      await withRetry(() => supabase.from("payroll_period_ledger").upsert(payload, { onConflict: "user_id,period_end" }), 15000);
      setMsg(t("payroll.legacy.inserted", { date: payload.period_end }));
      resetParse();
      await loadExisting();
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  // Prefill an existing week back into the editor (to review / correct + re-insert).
  async function editExisting(row) {
    const { data } = await supabase
      .from("payroll_period_ledger").select("*").eq("user_id", selectedId).eq("period_end", row.period_end).maybeSingle();
    if (!data) return;
    setSnapshot(ledgerRowToSnapshot(data));
    setPeriodEnd(data.period_end);
    setTalon(data.imported_talon || null);
    setFileName("");
    setErr(""); setMsg("");
  }

  const emp = employees.find((e) => e.id === selectedId);
  const printTitle = () => `${t("payroll.legacy.title")} — ${emp?.full_name || ""} — ${periodEnd}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("payroll.legacy.title")}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{t("payroll.legacy.hint")}</p>

        <label className="block text-xs">
          <span className="text-muted-foreground">{t("payroll.employee")}</span>
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); resetParse(); }} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">{t("testing.roe.employeePlaceholder")}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
          </select>
        </label>

        {selectedId && (
          <div className="flex flex-wrap items-center gap-2">
            <input id="legacy-stub-file" type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
            <Button type="button" size="sm" variant="outline" disabled={parsing} onClick={() => document.getElementById("legacy-stub-file")?.click()}>
              <Upload className="mr-2 h-4 w-4" />{parsing ? t("common.working") : t("payroll.legacy.upload")}
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>
        )}

        {msg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}

        {talon && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.legacy.preview")}</div>
              <Button type="button" size="sm" variant="outline" onClick={() => printLegacyTalon(talon, printTitle())}>
                <Printer className="mr-2 h-4 w-4" />{t("payroll.legacy.print")}
              </Button>
            </div>
            <TalonPreview talon={talon} />
          </div>
        )}

        {snapshot && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-[11px] text-muted-foreground">{t("payroll.legacy.verifyHint")}</div>
            <label className="block text-xs sm:max-w-xs">
              <span className="text-muted-foreground">{t("payroll.legacy.periodEnd")}</span>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 h-9" />
            </label>

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.legacy.statutory")}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {YTD_STATUTORY.map(([k, , label]) => (
                  <label key={k} className="block text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <Input type="number" step="0.01" inputMode="decimal" value={snapshot[k] ?? ""} onChange={(e) => setField(k)(e.target.value)} className="mt-1 h-9" />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.legacy.ccq")}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CCQ_CUMUL.map(([k, , label]) => (
                  <label key={k} className="block text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <Input type="number" step="0.01" inputMode="decimal" value={snapshot[k] ?? ""} onChange={(e) => setField(k)(e.target.value)} className="mt-1 h-9" />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" disabled={saving} onClick={insertWeek}>{saving ? t("common.working") : t("payroll.legacy.insert")}</Button>
            </div>
          </div>
        )}

        {existing.length > 0 && (
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.legacy.existing")}</div>
            <div className="max-h-52 divide-y overflow-y-auto">
              {existing.map((r) => (
                <div key={r.period_end} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-accent">
                  <button type="button" onClick={() => editExisting(r)} className="flex flex-1 items-center gap-2 text-left">
                    <span>{r.period_start ? `${dayjs(r.period_start).format("DD MMM")} – ` : ""}{dayjs(r.period_end).format("DD MMM YYYY")}{r.imported_talon ? ` · ${t("payroll.legacy.imported")}` : ""}</span>
                  </button>
                  <span className="flex items-center gap-3 font-mono text-xs">
                    <span>{money(r.insurable_income_ei)}</span>
                    <span>{(Number(r.hours_ytd) || 0).toFixed(1)} h</span>
                    {r.imported_talon && (
                      <button type="button" title={t("payroll.legacy.print")} onClick={() => printLegacyTalon(r.imported_talon, `${t("payroll.legacy.title")} — ${emp?.full_name || ""} — ${r.period_end}`)} className="rounded p-1 hover:bg-background">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
