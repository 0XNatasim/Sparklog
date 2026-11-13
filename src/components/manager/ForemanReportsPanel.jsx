import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ClipboardList, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { deleteForemanReport, fetchForemanReports, fetchNoteReads, filterReports, foremanReportsCsv, isNoteReturned, isNoteUnread, markNoteRead, MAX_RETURN_REASON, returnReportedJob } from "@/lib/foreman-reports";
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
  // This manager's readings (0138): { report id → read_at }. A note is unread for him until he opens it.
  const [reads, setReads] = useState(() => new Map());
  const [query, setQuery] = useState("");
  // The note whose sheet is being returned, and the optional reason typed for it.
  const [returning, setReturning] = useState(null);
  const [returnReason, setReturnReason] = useState("");

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchForemanReports(supabase)
      .then(async (list) => {
        const readMap = await fetchNoteReads(supabase, list.map((report) => report.id)).catch(() => new Map());
        if (!cancelled) { setReports(list); setReads(readMap); setError(""); }
      })
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

  async function markRead(report) {
    setReads((current) => new Map(current).set(report.id, new Date().toISOString()));
    markNoteRead(supabase, report.id).catch(() => setReads((current) => { const next = new Map(current); next.delete(report.id); return next; }));
  }

  async function remove(report) {
    if (!(await confirm(t("foremanNotes.confirmDelete")))) return;
    await act(report, () => deleteForemanReport(supabase, report.id), "foremanNotes.deleted");
  }

  function giveBack(report) {
    setReturnReason("");
    setReturning(report);
  }

  async function confirmReturn() {
    const report = returning;
    if (!report) return;
    setReturning(null);
    await act(report, () => returnReportedJob(supabase, report, returnReason), "foremanNotes.returned");
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
                <div className="flex items-center gap-2 font-semibold">
                  {report.author || t("foremanNotes.unknownAuthor")}
                  {isNoteUnread(report, reads.get(report.id)) && <Badge variant="destructive" className="uppercase tracking-wide">{t("foremanNotes.unread")}</Badge>}
                </div>
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
              {report.returned_at && (
                <div className={`rounded-md border px-3 py-2 text-sm ${isNoteReturned(report, job?.status) ? "border-warning/40 bg-warning/10 text-warning" : "border-muted bg-muted/40 text-muted-foreground"}`} role="status">
                  <div className="font-semibold">
                    {t(isNoteReturned(report, job?.status) ? "foremanNotes.returnedNow" : "foremanNotes.returnedBefore", { name: report.returned_by_name || "—", date: dayjs(report.returned_at).format("D MMM HH:mm") })}
                  </div>
                  {report.return_reason && <p className="mt-1 whitespace-pre-wrap">{t("foremanNotes.returnReasonShown", { reason: report.return_reason })}</p>}
                </div>
              )}
              {report.audited_name && <div className="text-sm"><span className="text-muted-foreground">{t("foremanNotes.audited")} : </span><b>{report.audited_name}</b></div>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.body}</p>
              <div className="flex flex-wrap justify-end gap-2">
                {isNoteUnread(report, reads.get(report.id)) && (
                  <Button type="button" size="sm" variant="outline" onClick={() => markRead(report)}>{t("foremanNotes.markRead")}</Button>
                )}
                {job?.status === "submitted" && (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => giveBack(report)}>{t("foremanNotes.returnSheet")}</Button>
                )}
                <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(report)}>{t("foremanNotes.delete")}</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Dialog open={Boolean(returning)} onOpenChange={(open) => { if (!open) setReturning(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("foremanNotes.returnTitle")}</DialogTitle>
            <DialogDescription>{t("foremanNotes.returnHint")}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm font-medium">
            <span>{t("foremanNotes.returnReasonLabel")}</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={returnReason}
              maxLength={MAX_RETURN_REASON}
              placeholder={t("foremanNotes.returnReasonPlaceholder")}
              onChange={(e) => setReturnReason(e.target.value)}
            />
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReturning(null)}>{t("common.cancel")}</Button>
            <Button type="button" onClick={confirmReturn}>{t("foremanNotes.returnConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
