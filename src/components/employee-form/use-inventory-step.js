// End-of-shift inventory step of the employee time entry: the day's screenshots (slots 1 to 3, several
// at once, migration 0092), the « Produits défectueux » answer and picture (slot 4, 0097), the reading
// of the lines, polled while the step is open, and the « complément » screenshot (slot 5, 0117) asked
// for when lines could not be read. The job and the day are saved by EmployeeForm.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { withTimeout } from "@/lib/utils";
import { evidenceUploadFailure, isFileFailure } from "@/lib/evidence-file";
import { reportFileReadError } from "@/lib/file-read-report";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { COMPLEMENT_SLOT, defectiveCaptured, missingInventorySlots, planInventoryUploads } from "@/lib/inventory-screenshots";
import { fetchInventoryReading, fetchInventorySlots, saveInventoryScreenshot } from "@/lib/inventory-upload";

export function useInventoryStep({ userId, dayRef, open, t }) {
  const inputRef = useRef(null);
  const slotRef = useRef(null);
  const multiInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [busySlot, setBusySlot] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Lines read from the day's screenshots against the app's "N de N" total ({ state, count, expected }).
  const [reading, setReading] = useState(null);
  const [readingTick, setReadingTick] = useState(0);
  // Answer to « Produits défectueux ? » after the list screenshots: null (not answered), "yes", "no".
  const [defectiveAnswer, setDefectiveAnswer] = useState(null);
  // A complément upload was attempted (sent or failed): the step can no longer hold the employee.
  const [complementTried, setComplementTried] = useState(false);

  // Opens the step for the end-of-shift day: the slots already captured are loaded. Returns whether
  // the step is still to do (a list slot or the defective-products picture missing).
  async function start() {
    setError("");
    setNotice("");
    setReading(null);
    setDefectiveAnswer(null);
    setComplementTried(false);
    try {
      const saved = await fetchInventorySlots(supabase, userId, dayRef.current);
      setRows(saved);
      setDefectiveAnswer(defectiveCaptured(saved) ? "yes" : null);
      return missingInventorySlots(saved).length > 0 || !defectiveCaptured(saved);
    } catch (loadError) {
      setRows([]);
      setError(friendlyErrorMessage(loadError, t, "form.errors.failedLoad"));
      return true;
    }
  }

  function pickSlot(slot) {
    setNotice("");
    slotRef.current = slot;
    inputRef.current?.click();
  }

  // One more list screenshot showing the lines that could not be read (replaces an earlier one).
  function pickComplement() {
    pickSlot(COMPLEMENT_SLOT);
  }

  function pickFiles() {
    multiInputRef.current?.click();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const slot = slotRef.current;
    if (!file || !slot || busySlot) return;
    await uploadShots([{ slot, file }]);
  }

  // Several screenshots chosen at once are placed in their slots by planInventoryUploads.
  async function handleFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length || busySlot) return;
    const { uploads, extra } = planInventoryUploads(files, rows);
    setNotice(extra > 0 ? t("form.inventory.extraIgnored", { count: extra }) : "");
    if (uploads.length) await uploadShots(uploads);
  }

  // Uploads one screenshot after the other; a failure does not stop the others.
  async function uploadShots(uploads) {
    setBusySlot(uploads[0].slot);
    setError("");
    let retentionDays = 30;
    try {
      const { data } = await withTimeout(
        supabase.from("overtime_settings").select("evidence_retention_days").eq("id", true).maybeSingle(),
        8000
      );
      retentionDays = Number(data?.evidence_retention_days) || 30;
    } catch { /* default retention applies */ }
    const failed = [];
    let lastError = null;
    let next = rows;
    for (const { slot, file } of uploads) {
      setBusySlot(slot);
      if (slot === COMPLEMENT_SLOT) setComplementTried(true);
      try {
        const previousPath = next.find((row) => row.slot === slot)?.storage_path || null;
        const path = await saveInventoryScreenshot(supabase, {
          userId,
          jobDate: dayRef.current,
          slot,
          file,
          retentionDays,
          previousPath,
        });
        next = [...next.filter((row) => row.slot !== slot), { slot, storage_path: path }];
        setRows(next);
      } catch (uploadError) {
        console.error("[inventory] screenshot failed", uploadError);
        if (isFileFailure(uploadError)) reportFileReadError("inventory", file, uploadError);
        failed.push(slot);
        lastError = uploadError;
      }
    }
    if (lastError) {
      const failure = evidenceUploadFailure(lastError);
      const which = uploads.length > 1 ? `${t("form.inventory.failedSlots", { slots: failed.join(", ") })} ` : "";
      setError(`${which}${t("form.inventory.uploadFailed")} ${t("form.evidence.reasonLabel")} ${t(`form.evidence.reason.${failure.key}`)}`);
    }
    setBusySlot(null);
    setReadingTick((tick) => tick + 1);
  }

  // While the step is open, show how many lines were read from the screenshots. The reading runs on
  // the server for a few seconds after each upload: poll a bounded number of times.
  const hasShots = rows.length > 0;
  useEffect(() => {
    const jobDate = dayRef.current;
    if (!open || !userId || !jobDate || !hasShots) return undefined;
    let cancelled = false;
    let timer = null;
    let tries = 0;
    const poll = async () => {
      try {
        const next = await fetchInventoryReading(supabase, userId, jobDate);
        if (cancelled) return;
        tries += 1;
        const stillReading = next.state === "reading" || next.defective?.state === "reading";
        // After about 80 s the step stops waiting: a slow or failed reading must not hold the employee.
        setReading(stillReading && tries >= 20 ? { ...next, timedOut: true } : next);
        if (stillReading && tries < 20) timer = window.setTimeout(poll, 4000);
      } catch {
        if (!cancelled) setReading(null);
      }
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, userId, hasShots, readingTick, dayRef]);

  // What the employee saw when leaving the step (0127): the reading and what the step asked. Never blocks or fails.
  function recordContinue(block) {
    if (!userId || !dayRef.current) return;
    const unreadable = reading?.unreadable?.length ?? null;
    try {
      Promise.resolve(supabase.from("inventory_reading_log").insert({
        user_id: userId,
        job_date: dayRef.current,
        reading_state: reading?.state ?? null,
        lines_read: reading?.count ?? null,
        lines_expected: reading?.expected ?? null,
        lines_missing: reading?.missing ?? null,
        lines_unreadable: unreadable,
        step_block: block || null,
        reading_known: Boolean(reading),
        complement_tried: complementTried || rows.some((row) => row.slot === COMPLEMENT_SLOT),
      })).then(() => undefined, () => undefined);
    } catch { /* a log line never holds the employee */ }
  }

  return {
    recordContinue,
    inputRef, multiInputRef, rows, busySlot, error, notice, reading, defectiveAnswer, setDefectiveAnswer, complementTried,
    start, pickSlot, pickFiles, pickComplement, handleFile, handleFiles,
  };
}
