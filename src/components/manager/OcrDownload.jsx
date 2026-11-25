import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_FILES_PER_ZIP, OVERTIME_BUCKET, downloadEvidenceZip, evidenceWeeks, selectEvidence } from "@/lib/evidence-download";
import { EVIDENCE_ALERT_EVENT } from "@/lib/evidence-alert";
import { proofCompareLines, proofSheetLines, renderProofSheet } from "@/lib/ocr-sheet";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// À traiter › OCR › « Télécharger » : same principle as Justificatifs › Télécharger (a week, a ZIP, what was already taken is
// remembered in evidence_downloads), but every proof comes as ONE image: the screenshot with its sheet beside it (Départ →
// Arrivée → Fin → Retour, kilometres, what the reader found against the timesheet), like the preview.
export default function OcrDownload({ rows }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [pickedWeek, setPickedWeek] = useState("");
  const [pickedDay, setPickedDay] = useState(""); // "" = the whole week
  const [includeDone, setIncludeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");

  const files = useMemo(() => (rows || []).filter((row) => row.storagePath && row.jobDate).map((row) => ({
    bucket: OVERTIME_BUCKET, path: row.storagePath, kind: "overtime", date: row.jobDate, userId: row.userId, employee: row.name, ot: row.jobOt, index: 1, count: 1, row,
  })), [rows]);

  async function loadDone() {
    const { data, error } = await supabase.from("evidence_downloads").select("bucket, storage_path").eq("bucket", OVERTIME_BUCKET).limit(QUERY_BUDGETS.evidenceDownload * 4);
    if (error) throw error;
    return new Set((data || []).map((entry) => `${entry.bucket}/${entry.storage_path}`));
  }
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadDone().then((set) => { if (!cancelled) setDone(set); }).catch((error) => { if (!cancelled) setLoadError(friendlyErrorMessage(error, t, "evidence.download.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, t]);

  const weeks = useMemo(() => evidenceWeeks(files), [files]);
  const week = weeks.find((item) => item.start === pickedWeek) || weeks[0] || null;
  // The days of that week that have a proof, newest first: one day can be taken alone (a day of the week not chosen = the whole week).
  const weekDays = useMemo(() => (week ? [...new Set(files.filter((file) => file.date >= week.start && file.date <= week.end).map((file) => file.date))].sort().reverse() : []), [files, week]);
  const day = weekDays.includes(pickedDay) ? pickedDay : "";
  const picked = useMemo(() => (done && week ? selectEvidence(files, { done, includeDone, from: day || week.start, to: day || week.end, kinds: ["overtime"] }) : null), [files, done, week, includeDone, day]);
  const weekLabel = (item) => `${t("manager.weekShort")} ${item.number} · ${dayjs(item.start).format("D MMM")} → ${dayjs(item.end).format("D MMM")}`;

  async function sheetFor(file, blob) {
    const row = file.row;
    const sections = [
      { title: t("ocr.preview.job"), lines: proofSheetLines(row, t) },
      { title: t("ocr.preview.compare"), lines: proofCompareLines(row, t) },
    ].filter((section) => section.lines.length);
    return renderProofSheet(blob, {
      title: row.name || "—",
      subtitle: `${dayjs(row.jobDate).format("dddd D MMMM YYYY")}${row.jobOt ? ` · OT ${row.jobOt}` : ""}`,
      sections,
      noJob: row.job ? "" : t("ocr.preview.noJob"),
    });
  }

  async function run() {
    if (!picked?.chosen.length || busy) return;
    setBusy(true);
    setResult("");
    try {
      const part = !includeDone && picked.inScope.length > MAX_FILES_PER_ZIP ? Math.floor(picked.alreadyDone / MAX_FILES_PER_ZIP) + 1 : 0;
      const outcome = await downloadEvidenceZip(supabase, picked.chosen, {
        labels: { overtime: t("evidence.download.fileOvertime"), parking: t("evidence.download.fileParking") },
        folders: { overtime: t("ocr.download.folder"), parking: t("evidence.download.folderParking") },
        filename: `${day ? t("ocr.download.zipDay", { day }) : t("ocr.download.zipFile", { week: week.number })}${part ? t("evidence.download.zipPart", { n: part }) : ""}.zip`,
        transform: (file, blob) => sheetFor(file, blob),
        onProgress: (index, total) => setProgress(t("evidence.download.progress", { index: index + 1, total })),
      });
      const parts = [t("evidence.download.done", { count: outcome.saved })];
      if (outcome.skipped) parts.push(t("evidence.download.skipped", { count: outcome.skipped }));
      if (outcome.remaining > 0) parts.push(t("evidence.download.more", { count: outcome.remaining }));
      if (outcome.markError) parts.push(t("evidence.download.markFailed"));
      setResult(parts.join(" "));
      setDone(await loadDone());
      window.dispatchEvent(new Event(EVIDENCE_ALERT_EVENT));
    } catch (error) {
      setResult(friendlyErrorMessage(error, t, "evidence.download.failed"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={files.length === 0} onClick={() => { setResult(""); setDone(null); setLoadError(""); setOpen(true); }}>
        <Download className="mr-1 h-4 w-4" aria-hidden="true" />{t("ocr.download.button")}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ocr.download.title")}</DialogTitle>
            <DialogDescription>{t("ocr.download.hint")}</DialogDescription>
          </DialogHeader>
          {loadError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{loadError}</div>}
          <label className="grid gap-1 text-sm font-medium">{t("evidence.download.week")}
            <Select value={week?.start || ""} onChange={(event) => { setPickedWeek(event.target.value); setPickedDay(""); setResult(""); }} disabled={busy || weeks.length === 0}>
              {weeks.map((item) => <option key={item.start} value={item.start}>{weekLabel(item)}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">{t("ocr.download.day")}
            <Select value={day} onChange={(event) => { setPickedDay(event.target.value); setResult(""); }} disabled={busy || weekDays.length === 0} aria-label={t("ocr.download.day")}>
              <option value="">{t("ocr.download.wholeWeek")}</option>
              {weekDays.map((date) => <option key={date} value={date}>{dayjs(date).format("dddd D MMM")}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDone} onChange={(event) => setIncludeDone(event.target.checked)} disabled={busy} className="h-4 w-4 accent-primary" />
            {t("evidence.download.includeDone")}
          </label>
          <p className="text-sm" aria-live="polite">
            {!picked && !loadError ? t("common.loading") : picked && t("evidence.download.count", { fresh: picked.fresh.length, done: picked.alreadyDone, chosen: picked.chosen.length })}
          </p>
          {picked && picked.chosen.length > MAX_FILES_PER_ZIP && <p className="text-xs text-muted-foreground">{t("evidence.download.batch", { max: MAX_FILES_PER_ZIP })}</p>}
          {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          {result && <p className="text-sm font-medium" role="status">{result}</p>}
          <Button type="button" onClick={run} disabled={busy || !picked?.chosen.length}>
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />{busy ? t("evidence.download.working") : t("evidence.download.start")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
