import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { fetchMyProofs, removeOwnProof, saveOwnProof, signedProofUrls } from "@/lib/overtime-proofs";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// History: the overtime proof of ONE work order. The employee sees the picture; while the sheet is still editable (saved or
// updated) they can replace it, remove it, or add it when it is missing. A submitted sheet is only changed by the managers.
export default function OvertimeProofDialog({ job, userId, editable, dailyMinutes = 0, hours = 8, onClose, onChanged }) {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const input = useRef(null);
  const replacing = useRef(null); // the proof the next picked file replaces, or null
  const [proofs, setProofs] = useState([]);
  const [urls, setUrls] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchMyProofs(supabase, job.job_date)
      .then(async (rows) => {
        const mine = rows.filter((row) => row.job_id === job.id);
        const links = await signedProofUrls(supabase, mine.map((row) => row.storage_path)).catch(() => new Map());
        if (!alive) return;
        setProofs(mine);
        setUrls(links);
        setMessage("");
      })
      .catch((error) => { if (alive) setMessage(friendlyErrorMessage(error, t, "proofs.loadFailed")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [job.id, job.job_date, reload, t]);

  function choose(proof) {
    replacing.current = proof?.id || null;
    input.current?.click();
  }

  async function picked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      await saveOwnProof(supabase, { userId, job, oldProofId: replacing.current, file, dailyMinutes });
      setReload((n) => n + 1);
      onChanged?.();
    } catch (error) {
      setMessage(friendlyErrorMessage(error, t, "proofs.failed"));
    } finally {
      replacing.current = null;
      setBusy(false);
    }
  }

  async function remove(proof) {
    if (!(await confirm(t("proofs.removeConfirm")))) return;
    setBusy(true);
    setMessage("");
    try {
      await removeOwnProof(supabase, proof.id);
      setReload((n) => n + 1);
      onChanged?.();
    } catch (error) {
      setMessage(friendlyErrorMessage(error, t, "proofs.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("proofs.title", { ot: job.ot })}</DialogTitle>
          <DialogDescription>{t(editable ? "proofs.description" : "proofs.locked")}</DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-info/30 bg-info/10 p-2 text-xs text-info">{t("proofs.rule", { hours })}</p>
        {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!loading && proofs.length === 0 && <p className="text-sm text-muted-foreground">{t("proofs.empty")}</p>}
        {proofs.map((proof, index) => (
          <div key={proof.id} className="space-y-2 rounded-md border p-2">
            {urls.get(proof.storage_path)
              ? <img src={urls.get(proof.storage_path)} alt={t("proofs.pictureAlt", { n: index + 1 })} className="max-h-96 w-full rounded object-contain" />
              : <p className="py-4 text-center text-xs text-muted-foreground">{t("proofs.imageUnavailable")}</p>}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => choose(proof)}>{t("proofs.replace")}</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => remove(proof)}>{t("proofs.remove")}</Button>
              </div>
            )}
          </div>
        ))}
        {editable && !loading && proofs.length === 0 && (
          <Button type="button" disabled={busy} onClick={() => choose(null)}>{busy ? t("proofs.uploading") : t("proofs.add")}</Button>
        )}
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={picked} aria-label={t("proofs.add")} />
        {busy && proofs.length > 0 && <p className="text-xs text-muted-foreground" role="status">{t("proofs.uploading")}</p>}
        {message && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message}</div>}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
