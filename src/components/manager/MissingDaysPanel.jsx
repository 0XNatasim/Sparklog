import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { hasManagementAccess } from "@/lib/roles";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { loadMissingEntryDays } from "@/lib/missing-days";

// Gestion V3 › Temps › « Jours sans saisie »: completed work days with no job entered, per employee
// (the same count as Avancé › Journal › Employés), with the dates and a link to the employee's time
// sheets. Weekends and CCQ non-worked days never count; full-day leave is excused.
const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 };

export default function MissingDaysPanel() {
  const t = useT();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("month");
  const [employees, setEmployees] = useState(null);
  const [result, setResult] = useState({ key: "", days: [], error: "" });
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    supabase.from("profiles").select("id, full_name, email, role, admin_sections, is_paused, show_on_boards, start_date").order("full_name").then(({ data, error }) => {
      if (!alive) return;
      if (error) setResult({ key: "error", days: [], error: error.message });
      // Employees only: anyone who can open Gestion is left out, like the Journal.
      setEmployees((data || []).filter((p) => !hasManagementAccess(p.role, p.admin_sections)));
    });
    return () => { alive = false; };
  }, []);

  const endDate = addCalendarDays(companyDate(), -1); // today is still in progress
  const startDate = addCalendarDays(endDate, -(PERIOD_DAYS[period] - 1));
  const key = `${period}|${startDate}|${endDate}|${employees?.length ?? "-"}`;
  useEffect(() => {
    if (!employees) return undefined;
    let cancelled = false;
    loadMissingEntryDays({ employees, startDate, endDate })
      .then((days) => { if (!cancelled) setResult({ key, days, error: "" }); })
      .catch((e) => { if (!cancelled) setResult({ key, days: [], error: e?.message || String(e) }); });
    return () => { cancelled = true; };
  }, [employees, startDate, endDate, key]);

  const loading = result.key !== key && result.key !== "error";
  const rows = useMemo(() => (loading ? [] : result.days.filter((d) => d.count > 0)), [loading, result.days]);
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{t("activity.missing.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("missingDays.help")}</p>
          </div>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("activity.filter.period")} className="h-10 w-auto">
            <option value="week">{t("activity.period.week")}</option>
            <option value="month">{t("activity.period.month")}</option>
            <option value="quarter">{t("activity.period.quarter")}</option>
          </Select>
        </div>
        {result.error && <p className="text-sm text-destructive" role="alert">{result.error}</p>}
        {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!loading && !result.error && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("missingDays.none")}</p>}
        <div className="space-y-1">
          {rows.map((item) => (
            <div key={item.id} className="rounded-md border">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-expanded={open.has(item.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate font-medium">{item.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-destructive">{t("activity.missing.days", { n: item.count })}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open.has(item.id) ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open.has(item.id) && (
                <div className="space-y-2 border-t px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {item.dates.map((date) => (
                      <span key={date} className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">{dayjs(date).format("ddd D MMM")}</span>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/manager/v3/time?tab=timesheets&emp=${item.id}`)}>
                    {t("missingDays.openTimesheets")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
