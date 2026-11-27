import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { MAX_NOTE_FILES, NOTE_FILE_ACCEPT, addPickedNoteImages, removeNoteFile, signedNoteFileUrls, uploadNoteFile } from "@/lib/note-files";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// The pictures of a note already saved (0165): thumbnails that open full size in a new tab, and — for whoever may — « add » and
// « remove ». `files` and the two callbacks are held by the page, which loads the pictures of all its notes at once.
export default function NoteImages({ kind, noteId, userId, files, canAdd = false, canRemove = false, onAdded, onRemoved }) {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const input = useRef(null);
  const [urls, setUrls] = useState(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const paths = files.map((file) => file.path).join("|");
  useEffect(() => {
    if (!paths) return undefined;
    let alive = true;
    signedNoteFileUrls(supabase, paths.split("|")).then((links) => { if (alive) setUrls(links); }).catch(() => undefined);
    return () => { alive = false; };
  }, [paths]);

  async function picked(event) {
    const chosen = [...(event.target.files || [])];
    event.target.value = "";
    const { files: accepted, skipped } = addPickedNoteImages([], chosen, files.length);
    setMessage(skipped ? t("noteFiles.skipped", { count: skipped }) : "");
    if (!accepted.length) return;
    setBusy(true);
    let failed = 0;
    for (const file of accepted) {
      try { onAdded?.(await uploadNoteFile(supabase, { kind, noteId, userId, file })); } catch (error) { failed += 1; console.warn("[note-files]", error); setMessage(friendlyErrorMessage(error, t, "noteFiles.uploadFailed")); }
    }
    if (failed && accepted.length > 1) setMessage(t("noteFiles.someFailed", { count: failed }));
    setBusy(false);
  }

  async function remove(file) {
    if (!(await confirm(t("noteFiles.removeConfirm")))) return;
    setBusy(true);
    try {
      await removeNoteFile(supabase, file);
      onRemoved?.(file);
    } catch (error) {
      setMessage(friendlyErrorMessage(error, t, "noteFiles.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!files.length && !canAdd) return null;
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("noteFiles.count", { count: files.length })}>
          {files.map((file, index) => (
            <li key={file.id} className="relative">
              {urls.get(file.path) ? (
                <a href={urls.get(file.path)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <img src={urls.get(file.path)} alt={t("noteFiles.alt", { n: index + 1 })} className="h-24 w-24 object-cover" loading="lazy" />
                </a>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-md border bg-muted p-1 text-center text-xs text-muted-foreground">{t("noteFiles.unavailable")}</div>
              )}
              {canRemove && (
                <button type="button" disabled={busy} onClick={() => remove(file)} aria-label={`${t("noteFiles.remove")} ${index + 1}`}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-destructive shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && files.length < MAX_NOTE_FILES && (
        <>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus className="mr-1.5 h-4 w-4" />{busy ? t("noteFiles.uploading") : t("noteFiles.add")}
          </Button>
          <input ref={input} type="file" accept={NOTE_FILE_ACCEPT} multiple className="hidden" aria-label={t("noteFiles.add")} onChange={picked} />
        </>
      )}
      {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
      {confirmDialog}
    </div>
  );
}
