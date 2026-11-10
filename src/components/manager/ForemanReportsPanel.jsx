import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ClipboardList, RefreshCw } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { fetchForemanReports, filterReports } from "@/lib/foreman-reports";
import { useT } from "@/lib/use-t";

// Gestion › Notes › Contremaître (0134): the short reports the foremen write about their audits, newest first.
export default function ForemanReportsPanel() {
  const t = useT();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchForemanReports(supabase)
      .then((list) => { if (!cancelled) { setReports(list); setError(""); } })
      .catch((e) => { if (!cancelled) { setReports((current) => current ?? []); setError(friendlyErrorMessage(e, t, "foremanNotes.errors.loadFailed")); } });
    return () => { cancelled = true; };
  }, [t, reloads]);

  const shown = useMemo(() => filterReports(reports || [], query), [reports, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("foremanNotes.search")} aria-label={t("foremanNotes.search")} />
        <Button type="button" variant="outline" size="sm" onClick={() => setReloads((n) => n + 1)}><RefreshCw className="mr-1.5 h-4 w-4" />{t("live.refresh")}</Button>
        {reports && <span className="text-sm text-muted-foreground">{t("foremanNotes.count", { n: shown.length })}</span>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {reports && !reports.length && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="h-4 w-4" />{t("foremanNotes.empty")}</p>
      )}
      {shown.map((report) => (
        <Card key={report.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="font-semibold">{report.author || t("foremanNotes.unknownAuthor")}</div>
              <div className="text-xs text-muted-foreground">{dayjs(report.created_at).format("ddd D MMM YYYY · HH:mm")}</div>
            </div>
            {report.audited_name && <div className="text-sm"><span className="text-muted-foreground">{t("foremanNotes.audited")} : </span><b>{report.audited_name}</b></div>}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
