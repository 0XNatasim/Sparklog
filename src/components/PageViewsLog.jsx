import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { groupPageViews, pageViewLabel } from "@/lib/page-views";

// Gestion → Journal → Onglets consultés: for each manager and each day, the pages / tabs opened and how many times
// (table manager_page_views, migration 0159; readable by the owner only; recorded since that migration).
const PERIOD_DAYS = { today: 0, week: 6, month: 29 };

export default function PageViewsLog() {
  const t = useT();
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState("all");
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState(""); // the period / reload the rows shown answer
  const [reloads, setReloads] = useState(0);
  const wanted = `${period}|${reloads}`;
  const loaded = loadedKey === wanted;

  useEffect(() => {
    let alive = true;
    const from = addCalendarDays(companyDate(), -PERIOD_DAYS[period]);
    Promise.all([
      supabase.from("manager_page_views").select("user_id, view_day, page, tab, views").gte("view_day", from).order("view_day", { ascending: false }).limit(QUERY_BUDGETS.pageViews),
      supabase.from("profiles").select("id, full_name, email").in("role", ["owner", "manager", "admin"]).order("full_name"),
    ]).then(([views, profiles]) => {
      if (!alive) return;
      setError(views.error ? views.error.message : "");
      setRows(views.data || []);
      setPeople(profiles.data || []);
      setLoadedKey(`${period}|${reloads}`);
    });
    return () => { alive = false; };
  }, [period, reloads]);

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.full_name || p.email || "—"])), [people]);
  const groups = useMemo(() => groupPageViews(rows).filter((group) => person === "all" || group.userId === person), [rows, person]);
  const knownIds = useMemo(() => [...new Set(rows.map((row) => row.user_id))], [rows]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <div className="font-semibold">{t("pageViews.title")}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("pageViews.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={person} onChange={(event) => setPerson(event.target.value)} aria-label={t("pageViews.person")} className="h-9 min-w-44">
            <option value="all">{t("pageViews.allPeople")}</option>
            {knownIds.map((id) => <option key={id} value={id}>{names.get(id) || id}</option>)}
          </Select>
          <Select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={t("activity.filter.period")} className="h-9">
            <option value="today">{t("activity.period.today")}</option>
            <option value="week">{t("activity.period.week")}</option>
            <option value="month">{t("activity.period.month")}</option>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={!loaded} onClick={() => setReloads((n) => n + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" />{t("pageViews.refresh")}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loaded && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}
        {loaded && !error && groups.length === 0 && <p className="text-sm text-muted-foreground">{t("pageViews.empty")}</p>}
        {groups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1 font-medium">{t("pageViews.col.day")}</th>
                  <th className="px-2 py-1 font-medium">{t("pageViews.col.person")}</th>
                  <th className="px-2 py-1 font-medium">{t("pageViews.col.pages")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("pageViews.col.total")}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.day}-${group.userId}`} className="border-t align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{dayjs(group.day).format("ddd D MMM")}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-semibold">{names.get(group.userId) || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {group.entries.map((entry) => (
                          <span key={`${entry.page}|${entry.tab}`} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {pageViewLabel(entry.page, entry.tab, t)} <span className="font-mono font-semibold">×{entry.views}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{group.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
