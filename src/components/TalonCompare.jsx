import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSearch, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";
import { compareWithTalon } from "@/lib/talon-compare";

// Same cent rounding as the comparison, so a displayed pair can never look different yet pass.
const cent = (value) => (Math.round(value * 100) / 100).toFixed(2);
const fmt = (value, unit) => (value == null ? "—" : unit === "h" ? `${cent(value)} h` : `$${cent(value)}`);
const fmtDiff = (value, unit) => (value == null ? "—" : `${value > 0 ? "+" : ""}${unit === "h" ? `${cent(value)} h` : `$${cent(value)}`}`);

// Upload the real talon of the calculated week and see, line by line, where SparkLog agrees
// to the cent and where it does not. Client-side only; nothing is saved.
export default function TalonCompare({ opening, closing, totals, onComparison }) {
  const t = useT();
  const inputRef = useRef(null);
  const [talon, setTalon] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const { parseFullTalon } = await import("@/lib/talon-import-parse");
      setTalon(await parseFullTalon(file));
      setFileName(file.name);
    } catch (e) {
      setTalon(null);
      setErr(e?.code === "no_text_layer" ? t("payroll.legacy.noText") : (e?.message || t("payroll.legacy.failed")));
    } finally {
      setBusy(false);
    }
  }

  const comparison = talon ? compareWithTalon({ opening, closing, totals, talon }) : null;

  // Let the page offer "keep this week" once the comparison is exact.
  const exact = !!comparison?.exact;
  const acceptable = !!comparison?.acceptable;
  const qcAdjustment = comparison?.qcAdjustment ?? 0;
  useEffect(() => {
    onComparison?.(talon ? { talon, exact, acceptable, qcAdjustment: comparison?.qcTolerated ? qcAdjustment : 0, fileName } : null);
  }, [talon, exact, acceptable, qcAdjustment, fileName]); // eslint-disable-line react-hooks/exhaustive-deps
  const header = talon?.header || {};

  const renderRows = (rows) => rows.map((row) => (
    <tr key={row.key || row.label} className={`border-b last:border-0 ${row.ok ? "" : "bg-red-500/10"}`}>
      <td className="px-3 py-1.5">{row.label}</td>
      <td className="px-3 py-1.5 text-right font-mono">{fmt(row.app, row.unit)}</td>
      <td className="px-3 py-1.5 text-right font-mono">{fmt(row.talon, row.unit)}</td>
      <td className={`px-3 py-1.5 text-right font-mono font-semibold ${row.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-700 dark:text-red-300"}`}>
        {row.ok ? "✓" : fmtDiff(row.diff, row.unit)}
      </td>
    </tr>
  ));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="h-4 w-4 text-primary" />{t("payroll.compare.title")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("payroll.compare.hint")}</p>
          </div>
          <div>
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? t("common.working") : t("payroll.compare.upload")}
            </Button>
          </div>
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        {comparison && (
          <>
            <div className="text-xs text-muted-foreground">
              {fileName} · {header.ref || "—"} · {header.periodStart || "?"} → {header.periodEnd || "?"}
            </div>
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${comparison.exact ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : comparison.qcTolerated ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200"}`}>
              {comparison.exact ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
              {comparison.exact ? t("payroll.compare.exact") : comparison.qcTolerated ? t("payroll.compare.qcTolerated") : t("payroll.compare.mismatches", { count: comparison.mismatches })}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("payroll.compare.line")}</th>
                    <th className="px-3 py-2 text-right font-medium">SparkLog</th>
                    <th className="px-3 py-2 text-right font-medium">{t("payroll.compare.talon")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("payroll.compare.diff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {renderRows(comparison.totals)}
                  {comparison.totals.length > 0 && comparison.lines.length > 0 && (
                    <tr className="border-b bg-muted/30"><td colSpan={4} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("payroll.compare.period")}</td></tr>
                  )}
                  {renderRows(comparison.lines)}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("payroll.compare.note")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
