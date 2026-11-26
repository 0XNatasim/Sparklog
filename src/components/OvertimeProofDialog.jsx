import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import OvertimeProofHowTo from "@/components/OvertimeProofHowTo";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { buildOcrRows } from "@/lib/ocr-readings";
import { fetchMyProofs, removeOwnProof, saveOwnProof, signedProofUrls } from "@/lib/overtime-proofs";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

// History: the overtime proof of ONE work order. The employee sees the picture; while the sheet is still editable (saved or
// updated) they can replace it, remove it, or add it when it is missing. A submitted sheet is only changed by the managers.
// A returned sheet (status « updated ») whose proofs were replaced: each new capture is read (queue, about a minute) and the dialog
// says whether it is now conform; when everything agrees it offers « Submit again » (`onResubmit`, the day's usual submission).
const READING_STATES = new Set(["queued", "notRead"]);
const POLL_MS = 15000;

export default function OvertimeProofDialog({ job, userId, editable, dailyMinutes = 0, dayJobs = null, firstTripUnpaid = false, tenHourDay = false, onResubmit = null, onClose, onChanged }) {
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
  const [pollTick, setPollTick] = useState(0);

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
  }, [job.id, job.job_date, reload, pollTick, t]);

  // The reading state of this work order's captures (same comparison as the managers' OCR tab).
  const rows = useMemo(() => buildOcrRows(
    proofs.map((proof) => ({ ...proof, user_id: userId, job_date: job.job_date })),
    dayJobs?.length ? dayJobs.map((item) => ({ ...item, user_id: userId })) : [{ ...job, user_id: userId }],
    new Map([[userId, { first_trip_unpaid: firstTripUnpaid, ten_hour_days: tenHourDay }]]),
  ), [proofs, dayJobs, job, userId, firstTripUnpaid, tenHourDay]);
  const stateOf = new Map(rows.map((row) => [row.id, row.state]));
  const reading = rows.some((row) => READING_STATES.has(row.state));
  // « failed » = the reading service refused (not the employee's fault): it does not hold the submission back.
  const allConform = rows.length > 0 && rows.every((row) => row.state === "ok" || row.state === "failed");
  const showCheck = editable && proofs.length > 0 && !loading;

  // While a capture is waiting to be read, look again every few seconds.
  useEffect(() => {
    if (!reading) return undefined;
    const timer = setInterval(() => setPollTick((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [reading]);

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
          {!editable && <DialogDescription>{t("proofs.locked")}</DialogDescription>}
        </DialogHeader>
        {editable && <OvertimeProofHowTo />}
        {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!loading && proofs.length === 0 && <p className="text-sm text-muted-foreground">{t("proofs.empty")}</p>}
        {proofs.map((proof, index) => (
          <div key={proof.id} className="space-y-2 rounded-md border p-2">
            {urls.get(proof.storage_path)
              ? <img src={urls.get(proof.storage_path)} alt={t("proofs.pictureAlt", { n: index + 1 })} className="max-h-96 w-full rounded object-contain" />
              : <p className="py-4 text-center text-xs text-muted-foreground">{t("proofs.imageUnavailable")}</p>}
            {showCheck && <ProofState state={stateOf.get(proof.id)} t={t} />}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => choose(proof)}>{t("proofs.replace")}</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => remove(proof)}>{t("proofs.remove")}</Button>
              </div>
            )}
          </div>
        ))}
        {editable && !loading && proofs.length < 2 && (
          <Button type="button" disabled={busy} onClick={() => choose(null)}>{busy ? t("proofs.uploading") : t("proofs.add")}</Button>
        )}
        {showCheck && (reading
          ? <p className="text-sm text-muted-foreground" role="status">{t("proofs.check.reading")}</p>
          : allConform
            ? <p className="text-sm font-semibold text-primary" role="status">{t("proofs.check.ok")}</p>
            : <p className="text-sm font-semibold text-destructive" role="alert">{t("proofs.check.bad")}</p>)}
        {showCheck && allConform && !reading && onResubmit && job.status === "updated" && (
          <Button type="button" disabled={busy} onClick={onResubmit}>{t("proofs.resubmit")}</Button>
        )}
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={picked} aria-label={t("proofs.add")} />
        {busy && proofs.length > 0 && <p className="text-xs text-muted-foreground" role="status">{t("proofs.uploading")}</p>}
        {message && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message}</div>}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

const BAD_KEYS = new Set(["mismatch", "incomplete", "unread", "sms", "field", "oldForm", "wrongDoc"]);
function ProofState({ state, t }) {
  if (!state) return null;
  if (READING_STATES.has(state)) return <p className="text-xs text-muted-foreground">{t("proofs.check.reading")}</p>;
  if (state === "ok") return <p className="text-xs font-semibold text-primary">{t("proofs.check.stateOk")}</p>;
  if (BAD_KEYS.has(state)) return <p className="text-xs font-semibold text-destructive">{t(`proofs.check.state.${state}`)}</p>;
  return null;
}
