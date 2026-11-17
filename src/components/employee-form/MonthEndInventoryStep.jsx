import React, { useRef, useState } from "react";
import { CircleCheck, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  MONTH_END_MAX_FILES, MONTH_END_MIN_FILES, addPickedMonthEndFiles, submitMonthEnd, uploadMonthEndFile,
} from "@/lib/month-end-inventory";
import { supabase } from "@/supabaseClient";

// The proof of the month-end inventory form: 5 to 10 screenshots of the filled form. Each picture is sent as soon as it
// is picked (nothing is lost if the screen closes); « Envoyer » records the proof once 5 are there. « Je ne l'ai pas
// encore » leaves the work sheets as drafts (the database refuses to submit them until the proof is sent).
export default function MonthEndInventoryStep({ t, userId, due, onSent, onLater }) {
  const inputRef = useRef(null);
  const [sent, setSent] = useState(due.filesCount || 0);
  const [busy, setBusy] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [message, setMessage] = useState("");
  const enough = sent >= MONTH_END_MIN_FILES;

  async function pick(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (!picked.length) return;
    setMessage("");
    const { files, skipped } = addPickedMonthEndFiles([], picked, sent);
    let failed = skipped;
    let lastError = "";
    setBusy(true);
    let count = sent;
    for (const file of files) {
      try {
        await uploadMonthEndFile(supabase, { userId, requestId: due.requestId }, file);
        count += 1;
        setSent(count);
      } catch (error) {
        failed += 1;
        lastError = friendlyErrorMessage(error, t, "monthEnd.errors.uploadFailed");
      }
    }
    if (failed) setMessage(lastError || t("monthEnd.errors.skipped", { count: failed }));
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      await submitMonthEnd(supabase, due.requestId);
      onSent();
    } catch (error) {
      setMessage(friendlyErrorMessage(error, t, "monthEnd.errors.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("monthEnd.title")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("monthEnd.description", { min: MONTH_END_MIN_FILES, max: MONTH_END_MAX_FILES })}</p>
        <Button type="button" size="sm" variant="outline" aria-expanded={showExample} onClick={() => setShowExample((visible) => !visible)}>
          {showExample ? t("monthEnd.hideExample") : t("monthEnd.showExample")}
        </Button>
        {showExample && (
          <div className="rounded-md border bg-background p-2">
            <img src="/month-end-form-example.png" alt={t("monthEnd.exampleAlt")} className="max-h-96 w-full rounded object-contain" />
          </div>
        )}
        <Button type="button" className="w-full" variant={sent ? "outline" : "default"} disabled={busy || sent >= MONTH_END_MAX_FILES} onClick={() => inputRef.current?.click()}>
          <Images className="mr-2 h-4 w-4" aria-hidden="true" />
          {busy ? t("monthEnd.uploading") : t("monthEnd.choose")}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} aria-label={t("monthEnd.choose")} />
        <p className="flex items-center gap-2 font-medium" role="status">
          {enough && <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />}
          {t("monthEnd.count", { count: sent, min: MONTH_END_MIN_FILES, max: MONTH_END_MAX_FILES })}
        </p>
        {message && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive" role="alert">{message}</div>}
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" disabled={busy} onClick={onLater}>{t("monthEnd.notYet")}</Button>
        <Button type="button" variant="success" disabled={busy || !enough} onClick={send}>{busy ? t("monthEnd.sending") : t("monthEnd.send")}</Button>
      </DialogFooter>
    </>
  );
}
