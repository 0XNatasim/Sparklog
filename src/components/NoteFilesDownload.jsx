import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { MAX_NOTE_ZIP_FILES, downloadNotePicturesZip, fetchNoteFiles, listNotePictures, noteDays, noteWeeks, selectNotePictures } from "@/lib/note-files";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

function saveZip(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// « Télécharger les photos » of the notes of a screen: one day or one week as a ZIP (the pictures, named by date / author /
// work order, and a notes.txt with the text of each note). `kind` = "manager" (Mes notes) or "foreman" (Contremaître);
// `notes` = [{ id, date, author, ot, text }] as the screen shows them. Nothing is removed by downloading.
export default function NoteFilesDownload({ kind, notes, disabled = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [byNote, setByNote] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState("week"); // "day" | "week"
  const [pickedDay, setPickedDay] = useState("");
  const [pickedWeek, setPickedWeek] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");

  const ids = useMemo(() => (notes || []).map((note) => note.id), [notes]);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetchNoteFiles(supabase, kind, ids)
      .then((loaded) => { if (!cancelled) setByNote(loaded); })
      .catch((error) => { if (!cancelled) setLoadError(friendlyErrorMessage(error, t, "noteFiles.download.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, kind, ids, t]);

  const files = useMemo(() => (byNote ? listNotePictures(notes, byNote) : []), [notes, byNote]);
  const days = useMemo(() => noteDays(files), [files]);
  const weeks = useMemo(() => noteWeeks(files), [files]);
  const day = days.includes(pickedDay) ? pickedDay : days[0] || "";
  const week = weeks.find((item) => item.start === pickedWeek) || weeks[0] || null;
  const chosen = useMemo(() => (mode === "day"
    ? (day ? selectNotePictures(files, { from: day, to: day }) : [])
    : (week ? selectNotePictures(files, { from: week.start, to: week.end }) : [])), [files, mode, day, week]);

  async function run() {
    if (!chosen.length || busy) return;
    setBusy(true);
    setResult("");
    try {
      const prefix = t(kind === "foreman" ? "noteFiles.zip.foreman" : "noteFiles.zip.mine");
      const filename = mode === "day" ? `${prefix} ${day}.zip` : `${prefix} ${t("noteFiles.zip.week", { week: week.number })}.zip`;
      const outcome = await downloadNotePicturesZip(supabase, chosen, notes, {
        filename, summaryName: t("noteFiles.zip.summary"), save: saveZip,
        onProgress: (index, total) => setProgress(t("noteFiles.download.progress", { index: index + 1, total })),
      });
      const parts = [t("noteFiles.download.done", { count: outcome.saved })];
      if (outcome.skipped) parts.push(t("noteFiles.download.skipped", { count: outcome.skipped }));
      if (outcome.remaining > 0) parts.push(t("noteFiles.download.more", { count: outcome.remaining }));
      setResult(parts.join(" "));
    } catch (error) {
      setResult(friendlyErrorMessage(error, t, "noteFiles.download.failed"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const weekLabel = (item) => `${t("manager.weekShort")} ${item.number} · ${dayjs(item.start).format("D MMM")} → ${dayjs(item.end).format("D MMM")}`;
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { setResult(""); setByNote(null); setLoadError(""); setOpen(true); }}>
        <Download className="mr-1.5 h-4 w-4" />{t("noteFiles.download.button")}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("noteFiles.download.title")}</DialogTitle>
            <DialogDescription>{t("noteFiles.download.hint")}</DialogDescription>
          </DialogHeader>
          {loadError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{loadError}</div>}
          <div role="radiogroup" aria-label={t("noteFiles.download.mode")} className="inline-flex rounded-md border bg-background p-0.5">
            {["day", "week"].map((value) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => { setMode(value); setResult(""); }}
                className={`min-h-9 rounded px-3 text-sm font-semibold ${mode === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t(`noteFiles.download.${value}`)}
              </button>
            ))}
          </div>
          {mode === "day" ? (
            <label className="grid gap-1 text-sm font-medium">{t("noteFiles.download.pickDay")}
              <Select value={day} onChange={(event) => { setPickedDay(event.target.value); setResult(""); }} disabled={busy || days.length === 0}>
                {days.map((value) => <option key={value} value={value}>{dayjs(value).format("ddd D MMM YYYY")}</option>)}
              </Select>
            </label>
          ) : (
            <label className="grid gap-1 text-sm font-medium">{t("noteFiles.download.pickWeek")}
              <Select value={week?.start || ""} onChange={(event) => { setPickedWeek(event.target.value); setResult(""); }} disabled={busy || weeks.length === 0}>
                {weeks.map((item) => <option key={item.start} value={item.start}>{weekLabel(item)}</option>)}
              </Select>
            </label>
          )}
          <p className="text-sm" aria-live="polite">
            {!byNote && !loadError ? t("common.loading") : chosen.length ? t("noteFiles.download.count", { count: chosen.length }) : t("noteFiles.download.empty")}
          </p>
          {chosen.length > MAX_NOTE_ZIP_FILES && <p className="text-xs text-muted-foreground">{t("noteFiles.download.batch", { max: MAX_NOTE_ZIP_FILES })}</p>}
          {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          {result && <p className="text-sm font-medium" role="status">{result}</p>}
          <Button type="button" onClick={run} disabled={busy || chosen.length === 0}>
            <Download className="mr-1 h-4 w-4" />{busy ? t("noteFiles.download.working") : t("noteFiles.download.start")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
