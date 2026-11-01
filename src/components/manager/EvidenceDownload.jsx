import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_FILES_PER_ZIP, downloadEvidenceZip, evidenceWeeks, loadEvidenceCatalog, selectEvidence } from "@/lib/evidence-download";
import { EVIDENCE_ALERT_EVENT } from "@/lib/evidence-alert";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// Justificatifs › « Télécharger » : the overtime screenshots and parking receipt pictures still kept in the app,
// as one ZIP. What was already downloaded is remembered (evidence_downloads), so a second download — a week
// again, or a longer period — only brings the new pictures, unless « déjà téléchargés » is ticked. The pictures
// stay in the app until their retention ends either way.
export default function EvidenceDownload() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [pickedWeek, setPickedWeek] = useState(""); // Sunday of the week chosen; "" = the latest week
  const [kinds, setKinds] = useState({ overtime: true, parking: true });
  const [includeDone, setIncludeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadEvidenceCatalog(supabase)
      .then((loaded) => { if (!cancelled) setCatalog(loaded); })
      .catch((error) => { if (!cancelled) setLoadError(friendlyErrorMessage(error, t, "evidence.download.loadFailed")); });
    return () => { cancelled = true; };
  }, [open, t]);

  const weeks = useMemo(() => (catalog ? evidenceWeeks(catalog.files) : []), [catalog]);
  // One week at a time: the one chosen, else the latest that holds pictures.
  const week = weeks.find((item) => item.start === pickedWeek) || weeks[0] || null;
  const picked = useMemo(() => (catalog && week
    ? selectEvidence(catalog.files, {
      done: catalog.done, includeDone, from: week.start, to: week.end,
      kinds: Object.keys(kinds).filter((kind) => kinds[kind]),
    })
    : null), [catalog, week, includeDone, kinds]);
  const weekLabel = (week) => `${t("manager.weekShort")} ${week.number} · ${dayjs(week.start).format("D MMM")} → ${dayjs(week.end).format("D MMM")}`;

  async function run() {
    if (!picked?.chosen.length || busy) return;
    setBusy(true);
    setResult("");
    try {
      // « justificatifs Sem43 » ; a week with more than one ZIP of pictures gets « - partie N ».
      const part = !includeDone && picked.inScope.length > MAX_FILES_PER_ZIP ? Math.floor(picked.alreadyDone / MAX_FILES_PER_ZIP) + 1 : 0;
      const outcome = await downloadEvidenceZip(supabase, picked.chosen, {
        labels: { overtime: t("evidence.download.fileOvertime"), parking: t("evidence.download.fileParking") },
        folders: { overtime: t("evidence.download.folderOvertime"), parking: t("evidence.download.folderParking") },
        filename: `${t("evidence.download.zipFile", { week: week.number })}${part ? t("evidence.download.zipPart", { n: part }) : ""}.zip`,
        onProgress: (index, total) => setProgress(t("evidence.download.progress", { index: index + 1, total })),
      });
      const parts = [t("evidence.download.done", { count: outcome.saved })];
      if (outcome.skipped) parts.push(t("evidence.download.skipped", { count: outcome.skipped }));
      if (outcome.remaining > 0) parts.push(t("evidence.download.more", { count: outcome.remaining }));
      if (outcome.markError) parts.push(t("evidence.download.markFailed"));
      setResult(parts.join(" "));
      setCatalog(await loadEvidenceCatalog(supabase));
      window.dispatchEvent(new Event(EVIDENCE_ALERT_EVENT));
    } catch (error) {
      setResult(friendlyErrorMessage(error, t, "evidence.download.failed"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const toggleKind = (kind) => setKinds((current) => ({ ...current, [kind]: !current[kind] }));
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setResult(""); setCatalog(null); setLoadError(""); setOpen(true); }}>
        <Download className="mr-1 h-4 w-4" />{t("evidence.download.button")}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("evidence.download.title")}</DialogTitle>
            <DialogDescription>{t("evidence.download.hint")}</DialogDescription>
          </DialogHeader>
          {loadError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{loadError}</div>}
          <label className="grid gap-1 text-sm font-medium">{t("evidence.download.week")}
            <Select value={week?.start || ""} onChange={(event) => { setPickedWeek(event.target.value); setResult(""); }} disabled={busy || weeks.length === 0}>
              {weeks.map((item) => <option key={item.start} value={item.start}>{weekLabel(item)}</option>)}
            </Select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={kinds.overtime} onChange={() => toggleKind("overtime")} disabled={busy} className="h-4 w-4 accent-primary" />{t("evidence.download.kindOvertime")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={kinds.parking} onChange={() => toggleKind("parking")} disabled={busy} className="h-4 w-4 accent-primary" />{t("evidence.download.kindParking")}</label>
          </div>
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
            <Download className="mr-1 h-4 w-4" />{busy ? t("evidence.download.working") : t("evidence.download.start")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
