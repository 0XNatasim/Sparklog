import React, { useEffect, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";

const LEVEL_COLUMNS = [
  { key: "rate_compagnon", label: "Compagnon" },
  { key: "rate_apprenti_4", label: "App 4" },
  { key: "rate_apprenti_3", label: "App 3" },
  { key: "rate_apprenti_2", label: "App 2" },
  { key: "rate_apprenti_1", label: "App 1" },
];

// Manager-only editor for the per-hour employer-contribution rates (by CCQ level) that
// feed the Costing tab's full employer cost. Seeded from the ACQ grid (migration 0035).
export default function EmployerContributionsManager() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savedCode, setSavedCode] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("employer_contributions")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function setLocal(code, field, value) {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, [field]: value } : r)));
  }

  async function saveField(code, field, rawValue) {
    const value = rawValue === "" || rawValue == null ? 0 : Number(rawValue);
    if (Number.isNaN(value)) return;
    const { error } = await supabase.from("employer_contributions").update({ [field]: value }).eq("code", code);
    if (error) setErr(error.message);
    else { setSavedCode(code); setTimeout(() => setSavedCode(""), 1200); }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" />{t("costing.contrib.title")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-4">
            <p className="mb-3 text-xs text-muted-foreground">{t("costing.contrib.description")}</p>
            {err && <div className="mb-2 text-xs text-destructive dark:text-red-300">{err}</div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("costing.contrib.line")}</th>
                    {LEVEL_COLUMNS.map((c) => <th key={c.key} className="px-2 py-2 text-right font-medium">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        {r.label}
                        {savedCode === r.code && <span className="ml-2 text-[11px] text-emerald-600 dark:text-emerald-400">✓</span>}
                      </td>
                      {LEVEL_COLUMNS.map((c) => (
                        <td key={c.key} className="px-2 py-1.5 text-right">
                          <Input
                            type="number" step="0.001" min="0" inputMode="decimal"
                            value={r[c.key] ?? ""}
                            onChange={(e) => setLocal(r.code, c.key, e.target.value)}
                            onBlur={(e) => saveField(r.code, c.key, e.target.value)}
                            className="h-8 w-24 text-right font-mono"
                            aria-label={`${r.label} ${c.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={LEVEL_COLUMNS.length + 1} className="px-3 py-4 text-center text-muted-foreground">—</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("costing.contrib.perHourNote")}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
