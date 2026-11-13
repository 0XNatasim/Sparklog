import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ClipboardList, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { deleteForemanReport, fetchForemanReports, filterReports, foremanReportsCsv, returnReportedJob } from "@/lib/foreman-reports";
import { statusBadgeVariant } from "@/lib/status";
import { useT } from "@/lib/use-t";

const STATUSES = ["saved", "updated", "submitted", "approved"];

// Gestion › Notes › Contremaître (0134, 0136): the notes the foremen attach to their work sheets, newest first. A note
// follows its job: the manager can return the job for correction (the foreman edits the job and its note), delete the
// note, or export all the notes as a CSV. Deleting the job itself deletes its note.
export default function ForemanReportsPanel() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState(null);
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

  async function act(report, run, doneKey) {
    setBusyId(report.id);
    setError("");
    setInfo("");
    try {
      await run();
      setInfo(t(doneKey));
      setReloads((n) => n + 1);
    } catch (e) {
      setError(friendlyErrorMessage(e, t, "foremanNotes.errors.actionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(report) {
    if (!(await confirm(t("foremanNotes.confirmDelete")))) return;
    await act(report, () => deleteForemanReport(supabase, report.id), "foremanNotes.deleted");
  }

  async function giveBack(report) {
    if (!(await confirm(t("foremanNotes.confirmReturn")))) return;
    await act(report, () => returnReportedJob(supabase, report.job), "foremanNotes.returned");
  }

  function exportCsv() {
    const labels = {
      columns: { date: t("foremanNotes.csv.date"), author: t("foremanNotes.csv.author"), ot: t("foremanNotes.csv.ot"), workDate: t("foremanNotes.csv.workDate"), times: t("foremanNotes.csv.times"), status: t("foremanNotes.csv.status"), audited: t("foremanNotes.audited"), note: t("foremanNotes.csv.note") },
      status: Object.fromEntries(STATUSES.map((status) => [status, t(`status.${status}`)])),
    };
    const blob = new Blob(["\uFEFF" + foremanReportsCsv(shown, labels)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notes-contremaitre-${companyDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("foremanNotes.search")} aria-label={t("foremanNotes.search")} />
        <Button type="button" variant="outline" size="sm" onClick={() => setReloads((n) => n + 1)}><RefreshCw className="mr-1.5 h-4 w-4" />{t("live.refresh")}</Button>
        <Button type="button" variant="outline" size="sm" disabled={!shown.length} onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />{t("foremanNotes.export")}</Button>
        {reports && <span className="text-sm text-muted-foreground">{t("foremanNotes.count", { n: shown.length })}</span>}
      </div>
      {info && <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{info}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {reports && !reports.length && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="h-4 w-4" />{t("foremanNotes.empty")}</p>
      )}
      {shown.map((report) => {
        const job = report.job;
        const busy = busyId === report.id;
        return (
          <Card key={report.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-semibold">{report.author || t("foremanNotes.unknownAuthor")}</div>
                <div className="text-xs text-muted-foreground">{dayjs(report.created_at).format("ddd D MMM YYYY · HH:mm")}</div>
              </div>
              {job ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("foremanNotes.sheet")} :</span>
                  <b>{job.ot}</b>
                  <span>{dayjs(job.job_date).format("D MMM")} · {String(job.depart || "").slice(0, 5)}–{String(job.fin || "").slice(0, 5)}</span>
                  <Badge variant={statusBadgeVariant(job.status)} className="uppercase tracking-wide">{t(`status.${job.status}`)}</Badge>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t("foremanNotes.noSheet")}</div>
              )}
              {report.audited_name && <div className="text-sm"><span className="text-muted-foreground">{t("foremanNotes.audited")} : </span><b>{report.audited_name}</b></div>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.body}</p>
              <div className="flex flex-wrap justify-end gap-2">
                {job?.status === "submitted" && (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => giveBack(report)}>{t("foremanNotes.returnSheet")}</Button>
                )}
                <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(report)}>{t("foremanNotes.delete")}</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {confirmDialog}
    </div>
  );
}
