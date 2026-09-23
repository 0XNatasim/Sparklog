import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { CalendarDays, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";
import { formatTimeOff, TIME_OFF_COLUMNS } from "@/lib/timeoff";
import TimeOffControls from "@/components/TimeOffControls";

// Dedicated Congés section (manager dashboard): manage every employee's time off in one
// place, backed by the same employee_time_off table as each employee's profile — so an entry
// added here shows in the profile and vice-versa. Supports full days, an hours window, and a
// weekly recurrence (e.g. never works Fridays).
export default function CongesManager() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [rowsByUser, setRowsByUser] = useState(new Map());
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = dayjs().format("YYYY-MM-DD");

  const loadRows = useCallback(async () => {
    // Upcoming dated congés (ending today or later) and all live recurrences (no end, or
    // an "until" still in the future).
    const { data, error: e } = await supabase
      .from("employee_time_off")
      .select(TIME_OFF_COLUMNS)
      .or(`end_date.gte.${today},end_date.is.null`)
      .order("start_date", { ascending: true });
    if (e) { setError(e.message); return; }
    const map = new Map();
    (data || []).forEach((row) => {
      if (!map.has(row.user_id)) map.set(row.user_id, []);
      map.get(row.user_id).push(row);
    });
    setRowsByUser(map);
  }, [today]);

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

  const selectedRows = useMemo(() => rowsByUser.get(selectedId) || [], [rowsByUser, selectedId]);
  // Employees that currently have any congé, in roster order, for the overview.
  const withConges = useMemo(
    () => employees.filter((e) => (rowsByUser.get(e.id) || []).length > 0),
    [employees, rowsByUser],
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-primary" />{t("conges.addTitle")}
          </div>
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
            <p className="text-xs text-muted-foreground">{t("conges.selectPrompt")}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">{t("common.working")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t("conges.overviewTitle")}</div>
          {!loading && withConges.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">{t("conges.empty")}</div>
          )}
          <div className="divide-y">
            {withConges.map((emp) => (
              <div key={emp.id} className="px-4 py-3">
                <div className="mb-1.5 text-sm font-semibold">{emp.full_name || emp.id}</div>
                <div className="space-y-1">
                  {(rowsByUser.get(emp.id) || []).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
                      <span className="flex items-center gap-2">
                        {row.kind === "recurring_weekly" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("timeOff.recurringTag")}</span>}
                        {formatTimeOff(row, t)}
                      </span>
                      <button type="button" onClick={() => remove(row.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
