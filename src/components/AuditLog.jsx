import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { BellRing, FilePlus2, Images, RefreshCw, UserCheck, ShieldCheck, Trash2, Unlock, CheckCircle2, PauseCircle, UserCog, Utensils, SquareParking, Eye, KeyRound, FileDown, Clock, Car } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { isAbortError, useLatestRequest } from "@/lib/latest-request";

const PAGE_SIZE = 100;

const ACTION_META = {
  user_deleted: { icon: Trash2, tone: "text-destructive" },
  inventory_deleted: { icon: Images, tone: "text-destructive" },
  role_change: { icon: UserCog, tone: "text-primary" },
  pause_change: { icon: PauseCircle, tone: "text-warning" },
  job_unlock: { icon: Unlock, tone: "text-warning" },
  job_approved: { icon: CheckCircle2, tone: "text-success" },
  job_created_by_owner: { icon: FilePlus2, tone: "text-primary" },
  manager_entry_confirmed: { icon: UserCheck, tone: "text-success" },
  manager_entry_deleted: { icon: Trash2, tone: "text-destructive" },
  manager_entry_reminded: { icon: BellRing, tone: "text-warning" },
  meal_reviewed: { icon: Utensils, tone: "text-primary" },
  parking_reviewed: { icon: SquareParking, tone: "text-primary" },
  parking_review_reset: { icon: SquareParking, tone: "text-warning" },
  approval_reverted: { icon: Clock, tone: "text-warning" },
  travel_rule_set: { icon: Car, tone: "text-primary" },
  nas_reveal: { icon: Eye, tone: "text-warning" },
  nas_update: { icon: KeyRound, tone: "text-warning" },
  nas_bulk_export: { icon: FileDown, tone: "text-destructive" },
};

// Every access to the NAS vault (migrations 0026 and 0084), grouped under one filter.
const NAS_ACTIONS = ["nas_reveal", "nas_update", "nas_bulk_export"];

export default function AuditLog() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // Latest filter wins: switching filters aborts the previous request and ignores its answer.
  const request = useLatestRequest();
  const load = useCallback(async () => {
    const ticket = request.begin();
    setLoading(true);
    setError("");
    let query = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE);
    if (filter === "nas") query = query.in("action", NAS_ACTIONS);
    else if (filter !== "all") query = query.eq("action", filter);
    const { data, error: loadError } = await query.abortSignal(ticket.signal);
    if (!ticket.isCurrent()) return;
    if (loadError) { if (!isAbortError(loadError)) setError(loadError.message); }
    else setRows(data || []);
    setLoading(false);
  }, [filter, request]);

  useEffect(() => { load(); }, [load]);

  function describe(row) {
    const target = row.target_name || t("audit.someone");
    const d = row.details || {};
    switch (row.action) {
      case "user_deleted": return t("audit.desc.userDeleted", { name: target, email: d.email || "—" });
      case "inventory_deleted": return t("audit.desc.inventoryDeleted", { name: target, date: d.job_date || "—", count: d.count || 0 });
      case "inventory_negative_dismissed": return t("audit.desc.inventoryNegativeDismissed", { name: target, date: d.job_date || "—" });
      case "role_change": return t("audit.desc.roleChange", { name: target, from: d.from || "—", to: d.to || "—" });
      case "pause_change": return t(d.is_paused ? "audit.desc.paused" : "audit.desc.unpaused", { name: target });
      case "job_unlock": return t("audit.desc.jobUnlock", { name: target, date: d.job_date || "—" });
      case "job_approved": return t("audit.desc.jobApproved", { name: target, date: d.job_date || "—" });
      case "job_created_by_owner": return t("audit.desc.jobCreatedByOwner", { name: target, date: d.job_date || "—" });
      case "manager_entry_confirmed": return t("audit.desc.managerEntryConfirmed", { name: target, date: d.job_date || "—" });
      case "manager_entry_deleted": return t("audit.desc.managerEntryDeleted", { name: target, date: d.job_date || "—" });
      case "manager_entry_reminded": return t("audit.desc.managerEntryReminded", { name: target, date: d.job_date || "—" });
      case "meal_reviewed": return t("audit.desc.mealReviewed", { name: target, status: d.status || "—" });
      case "parking_reviewed": return t("audit.desc.parkingReviewed", { name: target, status: d.status || "—" });
      case "parking_review_reset": return t("audit.desc.parkingReviewReset", { name: target, date: d.job_date || "—" });
      case "approval_reverted": return t("audit.desc.approvalReverted", { name: target, count: d.jobs ?? 0, from: d.from || "—", to: d.to || "—" });
      case "travel_rule_set": return t("audit.desc.travelRuleSet", {
        name: target, rule: t(`travel.rule.${d.rule_key}`), choice: t(`travel.choice.${d.choice}`), date: d.effective_from || "—",
      });
      case "nas_reveal": return t("audit.desc.nasReveal", { name: target });
      case "nas_update": return t(d.cleared ? "audit.desc.nasCleared" : "audit.desc.nasUpdate", { name: target });
      case "nas_bulk_export": return t("audit.desc.nasBulkExport", { count: d.returned ?? 0, reason: d.reason || "—" });
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
              <option value="inventory_deleted">{t("audit.filter.inventoryDeleted")}</option>
              <option value="inventory_negative_dismissed">{t("audit.filter.inventoryNegativeDismissed")}</option>
              <option value="role_change">{t("audit.filter.roleChange")}</option>
              <option value="pause_change">{t("audit.filter.pauseChange")}</option>
              <option value="job_unlock">{t("audit.filter.jobUnlock")}</option>
              <option value="job_approved">{t("audit.filter.jobApproved")}</option>
              <option value="job_created_by_owner">{t("audit.filter.jobCreatedByOwner")}</option>
              <option value="meal_reviewed">{t("audit.filter.mealReviewed")}</option>
              <option value="parking_reviewed">{t("audit.filter.parkingReviewed")}</option>
              <option value="travel_rule_set">{t("audit.filter.travelRuleSet")}</option>
              <option value="nas">{t("audit.filter.nas")}</option>
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

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
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
