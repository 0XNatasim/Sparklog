import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { CalendarDays, History, Plus, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";
import { formatTimeOff, categoryLabel, TIME_OFF_CATEGORIES, TIME_OFF_COLUMNS } from "@/lib/timeoff";
import TimeOffControls from "@/components/TimeOffControls";

// Full Congés tab (manager dashboard): a complete history of everyone's time off first —
// filterable by employee and by category (leave / vacation / absence / part-time) — then an
// add area. Backed by the same employee_time_off table as each employee's profile, so entries
// stay in sync both ways. Categories are informational (no pay effect).
export default function CongesManager() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filterEmp, setFilterEmp] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    // Full history — past, current, upcoming, and recurring — newest first.
    const { data, error: e } = await supabase
      .from("employee_time_off")
      .select(TIME_OFF_COLUMNS)
      .order("start_date", { ascending: false });
    if (e) { setError(e.message); return; }
    setRows(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, role, is_paused")
          .neq("role", "owner")
          .order("full_name", { ascending: true });
        if (pErr) throw pErr;
        if (cancelled) return;
        setEmployees(profs || []);
        await loadRows();
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadRows]);

  async function remove(id) {
    const { error: e } = await supabase.from("employee_time_off").delete().eq("id", id);
    if (e) { setError(e.message); return; }
    await loadRows();
  }

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.full_name || e.id])), [employees]);
  const selectedRows = useMemo(() => rows.filter((r) => r.user_id === selectedId), [rows, selectedId]);

  const history = useMemo(
    () => rows.filter((r) => (filterEmp === "all" || r.user_id === filterEmp) && (filterCat === "all" || r.category === filterCat)),
    [rows, filterEmp, filterCat],
  );

  // Count per category (respecting the employee filter) for the quick summary chips.
  const counts = useMemo(() => {
    const scope = rows.filter((r) => filterEmp === "all" || r.user_id === filterEmp);
    const m = { all: scope.length };
    for (const c of TIME_OFF_CATEGORIES) m[c] = 0;
    for (const r of scope) m[r.category] = (m[r.category] || 0) + 1;
    return m;
  }, [rows, filterEmp]);

  const chip = (value, label) => (
    <button
      type="button"
      onClick={() => setFilterCat(value)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"}`}
    >
      {label} <span className="text-muted-foreground">({counts[value] ?? 0})</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {/* History of everyone — first. */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />{t("conges.historyTitle")}</div>
            <label className="text-xs">
              <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="all">{t("conges.allEmployees")}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 border-b px-4 py-3">
            {chip("all", t("conges.allCategories"))}
            {TIME_OFF_CATEGORIES.map((c) => chip(c, categoryLabel(c, t)))}
          </div>
          {!loading && history.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">{t("conges.empty")}</div>
          )}
          <div className="divide-y">
            {history.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{nameById.get(row.user_id) || row.user_id}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{categoryLabel(row.category, t)}</span>
                    {row.kind === "recurring_weekly" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("timeOff.recurringTag")}</span>}
                    <span>{formatTimeOff(row, t)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => remove(row.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {loading && <div className="p-4 text-sm text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>

      {/* Add / manage for one employee. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" />{t("conges.addTitle")}</div>
          <label className="block text-xs sm:max-w-sm">
            <span className="text-muted-foreground">{t("conges.employee")}</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t("conges.employeePlaceholder")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}{e.is_paused ? ` — ${t("employees.paused")}` : ""}</option>)}
            </select>
          </label>
          {selectedId ? (
            <div className="rounded-lg border p-3">
              <TimeOffControls employeeId={selectedId} rows={selectedRows} onChanged={loadRows} />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />{t("conges.selectPrompt")}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
