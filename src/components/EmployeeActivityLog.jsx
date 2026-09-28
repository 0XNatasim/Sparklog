import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { CheckCircle2, FilePen, LogIn, MonitorSmartphone, RefreshCw, Trash2, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { hasManagementAccess } from "@/lib/roles";
import { QUERY_BUDGETS } from "@/lib/query-budgets";

// Gestion → Audit → Employés: when each employee signs in / opens the app and when
// they save, submit or delete a job (table employee_activity_log, migration 0067).

const EVENT_META = {
  login: { icon: LogIn, tone: "text-primary" },
  app_open: { icon: MonitorSmartphone, tone: "text-sky-600 dark:text-sky-300" },
  job_saved: { icon: FilePen, tone: "text-amber-600 dark:text-amber-300" },
  job_submitted: { icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-300" },
  job_deleted: { icon: Trash2, tone: "text-destructive dark:text-red-300" },
};

const TYPE_FILTERS = {
  all: null,
  connections: ["login", "app_open"],
  job_saved: ["job_saved"],
  job_submitted: ["job_submitted"],
  job_deleted: ["job_deleted"],
};

const PERIOD_DAYS = { today: 0, week: 7, month: 30, quarter: 90 };

function periodStart(period) {
  const days = PERIOD_DAYS[period] ?? 7;
  return dayjs().startOf("day").subtract(days, "day");
}

export default function EmployeeActivityLog() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [employee, setEmployee] = useState("all");
  const [type, setType] = useState("all");
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.from("profiles").select("id, full_name, email, role, admin_sections").order("full_name").then(({ data }) => {
      if (!alive) return;
      // Employees only: anyone who can open Gestion is left out.
      setEmployees((data || []).filter((p) => !hasManagementAccess(p.role, p.admin_sections)));
    });
    return () => { alive = false; };
  }, []);

  const employeeIds = useMemo(() => employees.map((e) => e.id), [employees]);

  const fetchPage = useCallback(async (before) => {
    let query = supabase
      .from("employee_activity_log")
      .select("id, created_at, user_id, user_name, event, job_id, details")
      .gte("created_at", periodStart(period).toISOString())
      .order("created_at", { ascending: false })
      .limit(QUERY_BUDGETS.employeeActivityPage);
    query = employee === "all" ? query.in("user_id", employeeIds) : query.eq("user_id", employee);
    if (TYPE_FILTERS[type]) query = query.in("event", TYPE_FILTERS[type]);
    if (before) query = query.lt("created_at", before);
    return query;
  }, [employee, employeeIds, period, type]);

  const load = useCallback(async () => {
    if (employeeIds.length === 0) return;
    setLoading(true);
    setError("");
    const { data, error: loadError } = await fetchPage(null);
    if (loadError) setError(loadError.message);
    else {
      setRows(data || []);
      setHasMore((data || []).length === QUERY_BUDGETS.employeeActivityPage);
    }
    setLoading(false);
  }, [employeeIds.length, fetchPage]);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    const { data, error: loadError } = await fetchPage(last.created_at);
    if (loadError) setError(loadError.message);
    else {
      setRows((current) => [...current, ...(data || [])]);
      setHasMore((data || []).length === QUERY_BUDGETS.employeeActivityPage);
    }
    setLoading(false);
  }

  const nameOf = useCallback((row) => {
    const e = employees.find((p) => p.id === row.user_id);
    return e?.full_name || e?.email || row.user_name || t("audit.someone");
  }, [employees, t]);

  function describe(row) {
    const d = row.details || {};
    const job = {
      ot: d.ot || "—",
      date: d.job_date ? dayjs(d.job_date).format("DD/MM") : "—",
      hours: d.depart && d.fin ? `${d.depart} → ${d.fin}` : "—",
    };
    switch (row.event) {
      case "login": return t("activity.desc.login");
      case "app_open": return t("activity.desc.appOpen");
      case "job_saved": return t(d.edit ? "activity.desc.jobEdited" : "activity.desc.jobSaved", job);
      case "job_submitted": return t("activity.desc.jobSubmitted", job);
      case "job_deleted": return t("activity.desc.jobDeleted", job);
      default: return row.event;
    }
  }

  // Latest connection per employee within the loaded rows (only when everyone is shown).
  const lastSeen = useMemo(() => {
    if (employee !== "all") return [];
    const seen = new Map();
    for (const row of rows) {
      if ((row.event === "login" || row.event === "app_open") && !seen.has(row.user_id)) seen.set(row.user_id, row.created_at);
    }
    return employees
      .map((e) => ({ id: e.id, name: e.full_name || e.email, at: seen.get(e.id) || null }))
      .sort((a, b) => (b.at || "").localeCompare(a.at || "") || a.name.localeCompare(b.name));
  }, [employee, employees, rows]);

  const counts = useMemo(() => {
    const c = { connections: 0, job_saved: 0, job_submitted: 0 };
    for (const row of rows) {
      if (row.event === "login" || row.event === "app_open") c.connections++;
      else if (row.event in c) c[row.event]++;
    }
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const out = [];
    for (const row of rows) {
      const key = dayjs(row.created_at).format("YYYY-MM-DD");
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  }, [rows]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-primary" />{t("activity.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("activity.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={employee} onChange={(event) => setEmployee(event.target.value)} aria-label={t("activity.filter.employee")} className="h-9 min-w-44">
              <option value="all">{t("activity.filter.allEmployees")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>)}
            </Select>
            <Select value={type} onChange={(event) => setType(event.target.value)} aria-label={t("activity.filter.type")} className="h-9">
              <option value="all">{t("activity.filter.allEvents")}</option>
              <option value="connections">{t("activity.filter.connections")}</option>
              <option value="job_saved">{t("activity.filter.jobSaved")}</option>
              <option value="job_submitted">{t("activity.filter.jobSubmitted")}</option>
              <option value="job_deleted">{t("activity.filter.jobDeleted")}</option>
            </Select>
            <Select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={t("activity.filter.period")} className="h-9">
              <option value="today">{t("activity.period.today")}</option>
              <option value="week">{t("activity.period.week")}</option>
              <option value="month">{t("activity.period.month")}</option>
              <option value="quarter">{t("activity.period.quarter")}</option>
            </Select>
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("live.refresh")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">{t("activity.count.connections", { n: counts.connections })}</span>
            <span className="rounded-full border px-2.5 py-1">{t("activity.count.jobSaved", { n: counts.job_saved })}</span>
            <span className="rounded-full border px-2.5 py-1">{t("activity.count.jobSubmitted", { n: counts.job_submitted })}</span>
          </div>
        </CardContent>
      </Card>

      {lastSeen.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold">{t("activity.lastSeenTitle")}</div>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {lastSeen.map((e) => (
                <button key={e.id} type="button" onClick={() => setEmployee(e.id)} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-muted">
                  <span className="truncate font-medium">{e.name}</span>
                  <span className={e.at ? "shrink-0 text-muted-foreground" : "shrink-0 text-amber-600 dark:text-amber-300"}>
                    {e.at ? dayjs(e.at).format("DD MMM HH:mm") : t("activity.notSeen")}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
      {!loading && rows.length === 0 && !error && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("activity.empty")}</CardContent></Card>
      )}

      {groups.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <div className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {dayjs(group.key).format("dddd D MMMM YYYY")}
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {group.rows.map((row) => {
                const meta = EVENT_META[row.event] || EVENT_META.app_open;
                const Icon = meta.icon;
                return (
                  <div key={row.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{dayjs(row.created_at).format("HH:mm")}</span>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{nameOf(row)}</span>
                      <span className="text-muted-foreground"> · {describe(row)}</span>
                      {row.details?.device && <span className="ml-1 text-xs text-muted-foreground">({row.details.device})</span>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={loadMore}>{t("activity.loadMore")}</Button>
        </div>
      )}
    </div>
  );
}
