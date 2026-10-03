import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { CalendarDays, History, Pencil, Plus, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { formatTimeOff, categoryLabel, matchesRecurrence, TIME_OFF_CATEGORIES, TIME_OFF_COLUMNS, WEEKDAY_KEYS, WEEKDAY_PICKER } from "@/lib/timeoff";
import TimeOffControls from "@/components/TimeOffControls";

const hm = (value) => (value ? String(value).slice(0, 5) : "");

// Inline editor for one history row. Keeps the row's kind (days / hours / recurring) and
// rewrites its fields; exceptions that no longer fall on the recurrence are dropped.
function TimeOffEditForm({ row, onSaved, onCancel }) {
  const t = useT();
  const isRecurring = row.kind === "recurring_weekly";
  const isHours = !isRecurring && Boolean(row.start_time && row.end_time);
  const [category, setCategory] = useState(row.category);
  const [from, setFrom] = useState(row.start_date || "");
  const [to, setTo] = useState(row.end_date || "");
  const [start, setStart] = useState(hm(row.start_time));
  const [end, setEnd] = useState(hm(row.end_time));
  const [weekdays, setWeekdays] = useState(row.weekdays || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    let patch;
    if (isRecurring) {
      if (!from) return;
      if (weekdays.length === 0) { setErr(t("timeOff.weekdaysError")); return; }
      if (to && to < from) { setErr(t("timeOff.rangeError")); return; }
      const sorted = [...weekdays].sort((a, b) => a - b);
      const candidate = { ...row, start_date: from, end_date: to || null, weekdays: sorted };
      const kept = (row.exception_dates || []).filter((date) => matchesRecurrence(candidate, date));
      patch = { category, start_date: from, end_date: to || null, weekdays: sorted, exception_dates: kept.length ? kept : null };
    } else if (isHours) {
      if (!from || !start || !end || end <= start) { setErr(t("timeOff.hoursError")); return; }
      patch = { category, start_date: from, end_date: from, start_time: start, end_time: end };
    } else {
      if (!from) return;
      const last = to || from;
      if (last < from) { setErr(t("timeOff.rangeError")); return; }
      patch = { category, start_date: from, end_date: last };
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("employee_time_off").update(patch).eq("id", row.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const toggleDay = (n) => setWeekdays((current) => (current.includes(n) ? current.filter((x) => x !== n) : [...current, n]));
  const field = (label, input) => (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {input}
    </label>
  );

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
        {field(t("timeOff.category"), (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {TIME_OFF_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
          </select>
        ))}
        {isHours
          ? field(t("timeOff.date"), <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />)
          : field(t(isRecurring ? "timeOff.effectiveFrom" : "timeOff.from"), <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />)}
        {!isHours && field(t(isRecurring ? "timeOff.untilOptional" : "timeOff.to"), <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />)}
        {isHours && field(t("timeOff.startTime"), <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />)}
        {isHours && field(t("timeOff.endTime"), <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />)}
      </div>
      {isRecurring && (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_PICKER.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => toggleDay(n)}
              aria-pressed={weekdays.includes(n)}
              className={`h-9 w-11 rounded-md border text-xs font-medium transition-colors ${weekdays.includes(n) ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"}`}
            >
              {t(`timeOff.weekdaysShort.${WEEKDAY_KEYS[n]}`)}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

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
  const [editingId, setEditingId] = useState(null);

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
  // Recurring rules first (they stay in force), then one-off entries, each newest first.
  const recurring = useMemo(() => history.filter((r) => r.kind === "recurring_weekly"), [history]);
  const oneOff = useMemo(() => history.filter((r) => r.kind !== "recurring_weekly"), [history]);

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
      {/* Add / manage for one employee — first. */}
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

      {/* History of everyone — below the add card. */}
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
          {[["recurring", recurring], ["oneOff", oneOff]].map(([key, list]) => list.length > 0 && (
            <div key={key}>
              {recurring.length > 0 && oneOff.length > 0 && (
                <div className="border-b bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(key === "recurring" ? "conges.recurringHeading" : "conges.oneOffHeading")} ({list.length})
                </div>
              )}
              <div className="divide-y">
                {list.map((row) => (
                  <div key={row.id} className="px-4 py-2.5">
                    {editingId === row.id ? (
                      <TimeOffEditForm row={row} onCancel={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await loadRows(); }} />
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{nameById.get(row.user_id) || row.user_id}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{categoryLabel(row.category, t)}</span>
                            {row.kind === "recurring_weekly" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("timeOff.recurringTag")}</span>}
                            <span>{formatTimeOff(row, t)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button type="button" onClick={() => setEditingId(row.id)} aria-label={t("conges.edit")} title={t("conges.edit")} className="rounded p-1 text-muted-foreground hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => remove(row.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {loading && <div className="p-4 text-sm text-muted-foreground">{t("common.working")}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
