import React, { useEffect, useState } from "react";
import { CalendarHeart, ChevronDown } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";

// Manager editor for the CCQ congés indemnity split (vacation / statutory holidays /
// sick). Stored as decimals in conges_indemnity_rate; edited here as percentages.
// This is the single source the ESTIMATE views (Costing, Week, Month) read; the
// authoritative export path keeps its own versioned constant, so this only moves
// labeled estimates.
const FIELDS = [
  { key: "vacation", labelKey: "costing.conges.vacation" },
  { key: "statutory_holidays", labelKey: "costing.conges.holidays" },
  { key: "sick", labelKey: "costing.conges.sick" },
];

export default function CongesIndemnityManager() {
  const t = useT();
  const [row, setRow] = useState(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("conges_indemnity_rate").select("*").eq("id", true).maybeSingle();
    if (error) setErr(error.message);
    else setRow(data || { vacation: 0.06, statutory_holidays: 0.055, sick: 0.015 });
  }
  useEffect(() => { load(); }, []);

  const asPct = (v) => (v == null || v === "" ? "" : (Number(v) * 100).toString());
  const total = FIELDS.reduce((s, f) => s + (Number(row?.[f.key]) || 0), 0);

  function setLocal(key, pctValue) {
    setRow((r) => ({ ...r, [key]: pctValue === "" ? "" : Number(pctValue) / 100 }));
  }

  async function saveField(key, pctValue) {
    const value = pctValue === "" || pctValue == null ? 0 : Number(pctValue) / 100;
    if (Number.isNaN(value)) return;
    const { error } = await supabase.from("conges_indemnity_rate").update({ [key]: value }).eq("id", true);
    if (error) setErr(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 1200); }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><CalendarHeart className="h-4 w-4 text-primary" />{t("costing.conges.title")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-4">
            <p className="mb-3 text-xs text-muted-foreground">{t("costing.conges.description")}</p>
            {err && <div className="mb-2 text-xs text-destructive dark:text-red-300">{err}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-xs">
                  <span className="text-muted-foreground">{t(f.labelKey)}</span>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number" step="0.001" min="0" inputMode="decimal"
                      value={asPct(row?.[f.key])}
                      onChange={(e) => setLocal(f.key, e.target.value)}
                      onBlur={(e) => saveField(f.key, e.target.value)}
                      className="h-9 text-right font-mono"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </label>
              ))}
              <div className="block text-xs">
                <span className="text-muted-foreground">{t("costing.conges.total")}</span>
                <div className="mt-1 flex h-9 items-center justify-end rounded-md border bg-muted/40 px-2 font-mono text-sm">
                  {(total * 100).toFixed(1)}% {saved && <span className="ml-2 text-[11px] text-emerald-600 dark:text-emerald-400">✓</span>}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("costing.conges.note")}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
