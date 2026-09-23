import React, { useState } from "react";
import dayjs from "dayjs";
import { X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { formatTimeOff, categoryLabel, TIME_OFF_CATEGORIES, DEFAULT_CATEGORY, WEEKDAY_KEYS, WEEKDAY_PICKER } from "@/lib/timeoff";

// One reusable congés editor for a single employee: the list of their entries (with delete)
// plus an add form supporting the three kinds — full day(s), a specific hours window, or a
// weekly recurrence (e.g. never works Fridays). Used inside each employee's profile AND the
// dedicated Congés section, so both read/write the same employee_time_off table and agree.
export default function TimeOffControls({ employeeId, rows = [], onChanged }) {
  const t = useT();
  const [mode, setMode] = useState("range"); // 'range' | 'hours' | 'recurring'
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [draft, setDraft] = useState({ from: "", to: "", date: "", start: "", end: "", weekdays: [], until: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleWeekday = (n) => setDraft((d) => ({ ...d, weekdays: d.weekdays.includes(n) ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n] }));

  async function add() {
    if (!employeeId) return;
    let payload = null;
    if (mode === "range") {
      const from = draft.from;
      const to = draft.to || draft.from;
      if (!from) return;
      if (to < from) { setErr(t("timeOff.rangeError")); return; }
      payload = { user_id: employeeId, category, kind: "range", start_date: from, end_date: to };
    } else if (mode === "hours") {
      if (!draft.date || !draft.start || !draft.end) { setErr(t("timeOff.hoursError")); return; }
      if (draft.end <= draft.start) { setErr(t("timeOff.hoursError")); return; }
      payload = { user_id: employeeId, category, kind: "range", start_date: draft.date, end_date: draft.date, start_time: draft.start, end_time: draft.end };
    } else {
      if (draft.weekdays.length === 0) { setErr(t("timeOff.weekdaysError")); return; }
      payload = {
        user_id: employeeId,
        category,
        kind: "recurring_weekly",
        start_date: draft.from || dayjs().format("YYYY-MM-DD"),
        end_date: draft.until || null,
        weekdays: [...draft.weekdays].sort((a, b) => a - b),
      };
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("employee_time_off").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDraft({ from: "", to: "", date: "", start: "", end: "", weekdays: [], until: "" });
    onChanged?.();
  }

  async function remove(id) {
    const { error } = await supabase.from("employee_time_off").delete().eq("id", id);
    if (error) { setErr(error.message); return; }
    onChanged?.();
  }

  const tabBtn = (value, label) => (
    <button
      type="button"
      onClick={() => { setMode(value); setErr(""); }}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${mode === value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {rows.length > 0 && (
        <div className="mb-3 space-y-1">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{categoryLabel(row.category, t)}</span>
                {row.kind === "recurring_weekly" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("timeOff.recurringTag")}</span>}
                {formatTimeOff(row, t)}
              </span>
              <button type="button" onClick={() => remove(row.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      <label className="mb-2 block text-xs sm:max-w-xs">
        <span className="mb-1 block text-muted-foreground">{t("timeOff.category")}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
          {TIME_OFF_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
        </select>
      </label>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {tabBtn("range", t("timeOff.modeDays"))}
        {tabBtn("hours", t("timeOff.modeHours"))}
        {tabBtn("recurring", t("timeOff.modeRecurring"))}
      </div>

      {mode === "range" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("timeOff.from")}</span>
            <Input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} className="h-9" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("timeOff.to")}</span>
            <Input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} className="h-9" />
          </label>
          <Button type="button" size="sm" disabled={busy} onClick={add}>{t("timeOff.add")}</Button>
        </div>
      )}

      {mode === "hours" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("timeOff.date")}</span>
            <Input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className="h-9" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("timeOff.startTime")}</span>
            <Input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} className="h-9" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("timeOff.endTime")}</span>
            <Input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} className="h-9" />
          </label>
          <Button type="button" size="sm" disabled={busy} onClick={add}>{t("timeOff.add")}</Button>
        </div>
      )}

      {mode === "recurring" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_PICKER.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => toggleWeekday(n)}
                className={`h-9 w-11 rounded-md border text-xs font-medium transition-colors ${draft.weekdays.includes(n) ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"}`}
              >
                {t(`timeOff.weekdaysShort.${WEEKDAY_KEYS[n]}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">{t("timeOff.effectiveFrom")}</span>
              <Input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} className="h-9" />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">{t("timeOff.untilOptional")}</span>
              <Input type="date" value={draft.until} onChange={(e) => set({ until: e.target.value })} className="h-9" />
            </label>
            <Button type="button" size="sm" disabled={busy} onClick={add}>{t("timeOff.add")}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("timeOff.recurringHint")}</p>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
