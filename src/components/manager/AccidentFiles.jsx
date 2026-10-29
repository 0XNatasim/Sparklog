import React, { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  ACCIDENT_FILE_ACCEPT, MAX_ACCIDENT_FILES, addPickedAccidentFiles, classifyAccidentFile, fetchAccidentFiles, formatBytes, removeAccidentFile,
  signedAccidentFileUrls, uploadAccidentFile,
} from "@/lib/accident-files";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { useT } from "@/lib/use-t";

// Pictures and documents of an accident file. On a saved file they are sent at once; on a new file they wait
// in `pending` and the register sends them after the file is saved.
export default function AccidentFiles({ accidentId, pending, setPending, onCountChange, disabled }) {
  const t = useT();
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, confirmDialog] = useConfirmDialog();

  useEffect(() => {
    if (!accidentId) return undefined;
    let cancelled = false;
    fetchAccidentFiles(accidentId)
      .then(async (rows) => {
        if (cancelled) return;
        setFiles(rows);
        const links = await signedAccidentFileUrls(rows.map((row) => row.path)).catch(() => new Map());
        if (!cancelled) setUrls(links);
      })
      .catch((error) => { if (!cancelled) setMessage(friendlyErrorMessage(error, t, "accidents.files.loadFailed")); });
    return () => { cancelled = true; };
  }, [accidentId, t]);

  async function pick(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (!picked.length) return;
    setMessage("");
    if (!accidentId) {
      const { files: next, skipped } = addPickedAccidentFiles(pending, picked, 0);
      setPending(next);
      if (skipped) setMessage(t("accidents.files.skipped", { count: skipped }));
      return;
    }
    const { files: accepted, skipped } = addPickedAccidentFiles([], picked, files.length);
    let failed = skipped;
    setBusy(true);
    const added = [];
    for (const file of accepted) {
      try {
        added.push(await uploadAccidentFile(accidentId, file));
      } catch (error) {
        failed += 1;
        setMessage(friendlyErrorMessage(error, t, "accidents.files.uploadFailed"));
      }
    }
    if (added.length) {
      setFiles((current) => [...current, ...added]);
      const links = await signedAccidentFileUrls(added.map((row) => row.path)).catch(() => new Map());
      setUrls((current) => new Map([...current, ...links]));
      onCountChange?.(added.length);
    }
    if (failed) setMessage((current) => current || t("accidents.files.someFailed", { count: failed }));
    setBusy(false);
  }

  async function remove(file) {
    if (!(await confirm(t("accidents.files.removeConfirm", { name: file.name })))) return;
    setBusy(true);
    setMessage("");
    try {
      await removeAccidentFile(file);
      setFiles((current) => current.filter((row) => row.id !== file.id));
      onCountChange?.(-1);
    } catch (error) {
      setMessage(friendlyErrorMessage(error, t, "accidents.files.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const total = accidentId ? files.length : pending.length;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" />{t("accidents.files.title")} <span className="font-normal text-muted-foreground">({total}/{MAX_ACCIDENT_FILES})</span></div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy || total >= MAX_ACCIDENT_FILES} onClick={() => input.current?.click()}>
          {t("accidents.files.add")}
        </Button>
        <input ref={input} type="file" multiple accept={ACCIDENT_FILE_ACCEPT} className="hidden" onChange={pick} aria-label={t("accidents.files.add")} />
      </div>
      <p className="text-xs text-muted-foreground">{accidentId ? t("accidents.files.help") : t("accidents.files.helpNew")}</p>
      {busy && <p className="text-xs text-muted-foreground">{t("common.working")}</p>}
      {message && <p className="text-xs text-destructive" role="alert">{message}</p>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {accidentId ? files.map((file) => {
          const url = urls.get(file.path);
          return (
            <li key={file.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              {file.kind === "image" && url
                ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={file.name} className="h-12 w-12 rounded border object-cover" /></a>
                : <FileText className="h-8 w-8 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <a href={url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url}
                className={`min-w-0 flex-1 truncate ${url ? "hover:underline" : "pointer-events-none opacity-60"}`}>
                {file.name}
                <span className="block text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span>
              </a>
              <Button type="button" variant="ghost" size="icon" aria-label={t("accidents.files.remove")} disabled={disabled || busy} onClick={() => remove(file)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        }) : pending.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <FileText className="h-8 w-8 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{file.name}<span className="block text-xs text-muted-foreground">{classifyAccidentFile(file)?.kind === "image" ? t("accidents.files.picture") : formatBytes(file.size)}</span></span>
            <Button type="button" variant="ghost" size="icon" aria-label={t("accidents.files.remove")} disabled={disabled} onClick={() => setPending(pending.filter((_, i) => i !== index))}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </div>
  );
}
