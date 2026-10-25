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

  function applyRates({ data, error }) {
    if (error) setErr(error.message);
    else setRow(data || { vacation: 0.06, statutory_holidays: 0.055, sick: 0.015 });
  }
  useEffect(() => {
    let alive = true;
    supabase.from("conges_indemnity_rate").select("*").eq("id", true).maybeSingle()
      .then((result) => { if (alive) applyRates(result); });
    return () => { alive = false; };
  }, []);

  const asPct = (v) => (v == null || v === "" ? "" : (Number(v) * 100).toString());
  const total = FIELDS.reduce((s, f) => s + (Number(row?.[f.key]) || 0), 0);


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
            {err && <div className="mb-2 text-xs text-destructive">{err}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="block text-xs">
                  <span className="text-muted-foreground">{t(f.labelKey)}</span>
                  <div className="mt-1 flex h-9 items-center justify-end rounded-md border bg-muted/40 px-2 font-mono text-sm">
                    {asPct(row?.[f.key]) || "0"}<span className="ml-1 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
              <div className="block text-xs">
                <span className="text-muted-foreground">{t("costing.conges.total")}</span>
                <div className="mt-1 flex h-9 items-center justify-end rounded-md border bg-muted/40 px-2 font-mono text-sm">
                  {(total * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("costing.conges.note")}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
