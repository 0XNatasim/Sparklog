import React, { useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { notifyBroadcastPush, pushOutcome } from "@/lib/push";
import { MAX_BROADCAST_ATTACHMENTS, addPickedFiles, broadcastAttachments, isPdfFile } from "@/lib/broadcast-attachments";
import { editIsEmpty, editIsUnchanged, recipientStatus } from "@/lib/broadcast-edit";
import { removeBroadcastFiles, uploadBroadcastFiles } from "@/lib/broadcast-upload";

// Edit a sent message (migration 0107): text and attachments. When someone has already pressed OK, the
// manager chooses whether they must read it again (their OK is cleared and a « Message modifié » push
// goes out). The previous version is kept by the database (broadcast_revisions) and the Journal.
export default function BroadcastEditForm({ broadcast, recipients, onSaved, onCancel }) {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const status = recipientStatus(recipients);
  const [body, setBody] = useState(broadcast.body || "");
  const [kept, setKept] = useState(() => broadcastAttachments(broadcast));
  const [added, setAdded] = useState([]); // [{ file, preview }]
  const [reread, setReread] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickFiles(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    const room = Math.max(0, MAX_BROADCAST_ATTACHMENTS - kept.length);
    const { files } = addPickedFiles(added.map((f) => f.file), picked);
    const allowed = files.slice(0, room);
    setError(allowed.length < added.length + picked.length ? t("broadcast.filesSkipped", { count: added.length + picked.length - allowed.length, max: MAX_BROADCAST_ATTACHMENTS }) : "");
    setAdded(allowed.map((file) => added.find((f) => f.file === file) || { file, preview: isPdfFile(file) ? "" : URL.createObjectURL(file) }));
  }

  function removeAdded(index) {
    setAdded((current) => {
      if (current[index]?.preview) URL.revokeObjectURL(current[index].preview);
      return current.filter((_, i) => i !== index);
    });
  }

  async function save() {
    setError("");
    const askReread = status.acked > 0 && reread;
    if (editIsEmpty(body, [...kept, ...added])) { setError(t("broadcast.needMessage")); return; }
    if (added.length === 0 && editIsUnchanged(broadcast, body, kept)) { setError(t("broadcast.editUnchanged")); return; }
    const question = askReread
      ? t("broadcast.editConfirmReread", { count: status.acked })
      : status.acked > 0 ? t("broadcast.editConfirmSilent", { count: status.acked }) : t("broadcast.editConfirm");
    if (!(await confirm(question))) return;

    setBusy(true);
    let uploaded = [];
    try {
      uploaded = await uploadBroadcastFiles(added.map((f) => f.file));
      const { data, error: rpcError } = await supabase.rpc("edit_broadcast", {
        p_broadcast_id: broadcast.id,
        p_body: body.trim(),
        p_attachments: [...kept, ...uploaded],
        p_reread: askReread,
      });
      if (rpcError) throw rpcError;
      // Push only when someone has to read it again; otherwise the corrected text simply replaces the old one.
      const push = Number(data?.reread_count) > 0 ? pushOutcome(await notifyBroadcastPush(broadcast.id, { reread: true })) : null;
      added.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      const saved = Number(data?.reread_count) > 0 ? t("broadcast.editedReread", { count: data.reread_count }) : t("broadcast.edited");
      onSaved(push?.tone === "warning" ? `${saved} ${t(push.key, push.params)}` : saved);
    } catch (e) {
      await removeBroadcastFiles(uploaded);
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t bg-muted/30 p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(12, Math.max(3, body.split("\n").length + 1))}
        aria-label={t("broadcast.message")}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        {kept.map((a, index) => (
          <span key={a.path} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
            {a.kind === "pdf" ? <FileText className="h-3.5 w-3.5 text-destructive" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span className="max-w-[10rem] truncate">{a.kind === "pdf" ? a.name || "PDF" : t("broadcast.pictureN", { n: index + 1 })}</span>
            <button type="button" onClick={() => setKept((list) => list.filter((x) => x.path !== a.path))} aria-label={t("broadcast.removeFile")} className="rounded p-0.5 hover:bg-accent"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {added.map(({ file, preview }, index) => (
          <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-background px-2 py-1 text-xs">
            {preview ? <img src={preview} alt="" className="h-6 w-6 rounded object-cover" /> : <FileText className="h-3.5 w-3.5 text-destructive" />}
            <span className="max-w-[10rem] truncate">{file.name || "PDF"}</span>
            <button type="button" onClick={() => removeAdded(index)} aria-label={t("broadcast.removeFile")} className="rounded p-0.5 hover:bg-accent"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {kept.length + added.length < MAX_BROADCAST_ATTACHMENTS && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">
            <Paperclip className="h-3.5 w-3.5" />{t("broadcast.attachFiles")}
            <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={pickFiles} className="hidden" />
          </label>
        )}
      </div>

      {status.acked > 0 ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={reread} onChange={(e) => setReread(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>{t("broadcast.rereadLabel", { count: status.acked })}</span>
        </label>
      ) : null}
      {status.pending > 0 && <p className="text-xs text-muted-foreground">{t("broadcast.editPendingHint", { count: status.pending })}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
      {confirmDialog}
    </div>
  );
}
