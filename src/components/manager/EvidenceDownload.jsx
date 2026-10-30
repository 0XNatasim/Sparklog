import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_FILES_PER_ZIP, downloadEvidenceZip, loadEvidenceCatalog, selectEvidence } from "@/lib/evidence-download";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { companyDate } from "@/lib/company-time";
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  const picked = useMemo(() => (catalog
    ? selectEvidence(catalog.files, { done: catalog.done, includeDone, from, to, kinds: Object.keys(kinds).filter((kind) => kinds[kind]) })
    : null), [catalog, includeDone, from, to, kinds]);

  async function run() {
    if (!picked?.chosen.length || busy) return;
    setBusy(true);
    setResult("");
    try {
      const outcome = await downloadEvidenceZip(supabase, picked.chosen, {
        labels: { overtime: t("evidence.download.fileOvertime"), parking: t("evidence.download.fileParking") },
        filename: `${t("evidence.download.zipName")}-${companyDate()}.zip`,
        onProgress: (index, total) => setProgress(t("evidence.download.progress", { index: index + 1, total })),
      });
      const parts = [t("evidence.download.done", { count: outcome.saved })];
      if (outcome.skipped) parts.push(t("evidence.download.skipped", { count: outcome.skipped }));
      if (outcome.remaining > 0) parts.push(t("evidence.download.more", { count: outcome.remaining }));
      if (outcome.markError) parts.push(t("evidence.download.markFailed"));
      setResult(parts.join(" "));
      setCatalog(await loadEvidenceCatalog(supabase));
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
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-medium">{t("evidence.download.from")}
              <Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} disabled={busy} />
            </label>
            <label className="grid gap-1 text-sm font-medium">{t("evidence.download.to")}
              <Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} disabled={busy} />
            </label>
          </div>
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
