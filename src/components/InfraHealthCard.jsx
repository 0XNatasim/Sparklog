import React, { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Activity, ChevronDown, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { withRetry } from "@/lib/utils";
import { useT } from "@/lib/use-t";

const TONES = {
  good: "text-emerald-600 dark:text-emerald-400",
  ok: "text-sky-600 dark:text-sky-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive dark:text-red-300",
};

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

// Collapsible infrastructure-health card for the audit screen. Live figures (DB size, jobs
// table, connections) come from get_infra_stats(); CPU/memory/IOPS are not in Postgres, so
// they show the qualitative snapshot from the last infra audit.
export default function InfraHealthCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await withRetry(() => supabase.rpc("get_infra_stats"), 8000);
      if (rpcError) throw rpcError;
      setStats(data || null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch only once the card is opened (and not already loaded).
  useEffect(() => { if (open && !stats && !loading) load(); }, [open, stats, loading, load]);

  const dbPct = stats ? Math.round((Number(stats.db_size_bytes) / Number(stats.free_quota_bytes)) * 100) : 0;
  const connPct = stats ? Math.round((Number(stats.total_connections) / Number(stats.max_connections)) * 100) : 0;

  const liveRows = stats ? [
    { label: t("infra.db"), value: `${fmtBytes(stats.db_size_bytes)} / ${fmtBytes(stats.free_quota_bytes)} (${dbPct}%)`, tone: dbPct < 60 ? "good" : dbPct < 85 ? "warn" : "bad" },
    { label: t("infra.jobsTable"), value: `${fmtBytes(stats.jobs_bytes)} · ${Number(stats.jobs_rows).toLocaleString("fr-CA")} ${t("infra.rows")}`, tone: "good" },
    { label: t("infra.connections"), value: `${stats.total_connections} / ${stats.max_connections} (${connPct}%)`, tone: connPct < 60 ? "good" : connPct < 85 ? "warn" : "bad" },
  ] : [];

  // Qualitative snapshot (not queryable from Postgres) — from the last infra audit.
  const snapshotRows = [
    { label: t("infra.cpu"), value: t("infra.excellent"), tone: "good" },
    { label: t("infra.memory"), value: t("infra.normal"), tone: "ok" },
    { label: t("infra.network"), value: t("infra.veryLow"), tone: "good" },
    { label: t("infra.disk"), value: t("infra.almostEmpty"), tone: "good" },
    { label: t("infra.iops"), value: t("infra.extremelyLow"), tone: "good" },
  ];

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Activity className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t("infra.title")}</div>
          <div className="truncate text-xs text-muted-foreground">{t("infra.subtitle")}</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <CardContent className="space-y-4 border-t p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("infra.liveTitle")}</div>
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("live.refresh")}
            </Button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && !stats && <p className="text-xs text-muted-foreground">{t("common.working")}</p>}

          {stats && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {liveRows.map((r) => (
                <div key={r.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{r.label}</div>
                  <div className={`mt-0.5 text-sm font-semibold tabular-nums ${TONES[r.tone]}`}>{r.value}</div>
                </div>
              ))}
            </div>
          )}

          {stats?.as_of && (
            <p className="text-[10px] text-muted-foreground">{t("live.updated", { time: dayjs(stats.as_of).format("YYYY-MM-DD HH:mm:ss") })}</p>
          )}

          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("infra.snapshotTitle")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {snapshotRows.map((r) => (
              <div key={r.label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{r.label}</div>
                <div className={`mt-0.5 text-sm font-semibold ${TONES[r.tone]}`}>{r.value}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">{t("infra.snapshotNote")}</p>
        </CardContent>
      )}
    </Card>
  );
}
