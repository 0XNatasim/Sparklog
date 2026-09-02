import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { RefreshCw, ShieldCheck, Trash2, Unlock, CheckCircle2, PauseCircle, UserCog, Utensils, SquareParking } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";

const PAGE_SIZE = 100;

const ACTION_META = {
  user_deleted: { icon: Trash2, tone: "text-destructive dark:text-red-300" },
  role_change: { icon: UserCog, tone: "text-primary" },
  pause_change: { icon: PauseCircle, tone: "text-amber-600 dark:text-amber-300" },
  job_unlock: { icon: Unlock, tone: "text-amber-600 dark:text-amber-300" },
  job_approved: { icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-300" },
  meal_reviewed: { icon: Utensils, tone: "text-primary" },
  parking_reviewed: { icon: SquareParking, tone: "text-primary" },
};

export default function AuditLog() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE);
    if (filter !== "all") query = query.eq("action", filter);
    const { data, error: loadError } = await query;
    if (loadError) setError(loadError.message);
    else setRows(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function describe(row) {
    const target = row.target_name || t("audit.someone");
    const d = row.details || {};
    switch (row.action) {
      case "user_deleted": return t("audit.desc.userDeleted", { name: target, email: d.email || "—" });
      case "role_change": return t("audit.desc.roleChange", { name: target, from: d.from || "—", to: d.to || "—" });
      case "pause_change": return t(d.is_paused ? "audit.desc.paused" : "audit.desc.unpaused", { name: target });
      case "job_unlock": return t("audit.desc.jobUnlock", { name: target, date: d.job_date || "—" });
      case "job_approved": return t("audit.desc.jobApproved", { name: target, date: d.job_date || "—" });
      case "meal_reviewed": return t("audit.desc.mealReviewed", { name: target, status: d.status || "—" });
      case "parking_reviewed": return t("audit.desc.parkingReviewed", { name: target, status: d.status || "—" });
      default: return row.action;
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />{t("audit.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("audit.description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("audit.filterLabel")} className="h-9">
              <option value="all">{t("audit.filter.all")}</option>
              <option value="user_deleted">{t("audit.filter.userDeleted")}</option>
              <option value="role_change">{t("audit.filter.roleChange")}</option>
              <option value="pause_change">{t("audit.filter.pauseChange")}</option>
              <option value="job_unlock">{t("audit.filter.jobUnlock")}</option>
              <option value="job_approved">{t("audit.filter.jobApproved")}</option>
              <option value="meal_reviewed">{t("audit.filter.mealReviewed")}</option>
              <option value="parking_reviewed">{t("audit.filter.parkingReviewed")}</option>
            </Select>
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("live.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold">{t("audit.legendTitle")}</div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>🗑️ {t("audit.legend.userDeleted")}</li>
            <li>👤 {t("audit.legend.roleChange")}</li>
            <li>⏸️ {t("audit.legend.pauseChange")}</li>
            <li>🔓 {t("audit.legend.jobUnlock")}</li>
            <li>✅ {t("audit.legend.jobApproved")}</li>
            <li>🍽️ {t("audit.legend.mealParking")}</li>
          </ul>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
      {!loading && rows.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("audit.empty")}</CardContent></Card>}

      <div className="space-y-2">
        {rows.map((row) => {
          const meta = ACTION_META[row.action] || { icon: ShieldCheck, tone: "text-muted-foreground" };
          const Icon = meta.icon;
          return (
            <Card key={row.id}>
              <CardContent className="flex items-start gap-3 p-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{describe(row)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t("audit.byLine", { actor: row.actor_name || t("audit.someone") })} · {dayjs(row.created_at).format("DD MMM YYYY, HH:mm")}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
