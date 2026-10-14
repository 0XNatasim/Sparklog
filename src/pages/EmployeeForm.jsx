import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { Camera, CircleCheck, TriangleAlert } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status";
import { isAdminEmployee, isManagerRole } from "@/lib/roles";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useT } from "@/lib/use-t";
import { refreshSessionOnce, withRetry, withTimeout } from "@/lib/utils";
import { mealDecision } from "@/lib/meal-eligibility";
import { buildJobSaveRpcArgs, buildJobSaveWithEvidenceRpcArgs, kilometreFieldValue, requiresEvidenceBeforeSave } from "@/lib/job-submission";
import { RETURN_TIME_OPTIONS, validateJobSubmissionContract } from "@/lib/job-contract";
import { COMPANY_TIME_ZONE, companyDate } from "@/lib/company-time";
import { deleteDraft, loadDraft, saveDraft as persistDraft } from "@/lib/draft-store";
import { evidenceUploadFailure, prepareEvidenceImage } from "@/lib/evidence-file";
import { friendlyErrorMessage, isOfflineError } from "@/lib/error-messages";
import { classifyApiError } from "@/lib/api-errors";
import { submitSavedJob } from "@/lib/submit-job";
import { extractWorkOrderText, parseExtractedText, workOrderIssues } from "@/lib/work-order-ocr";
import { isPendingManagerEntry } from "@/lib/manager-entry";
import { dayFirstTripUnpaidMinutes } from "@/lib/payroll-calculations";
import { INVENTORY_SLOTS, missingInventorySlots } from "@/lib/inventory-screenshots";
import { fetchInventorySlots, saveInventoryScreenshot } from "@/lib/inventory-upload";
import { isJobOverlapError, jobOverlapDetails, jobOverlapMessage } from "@/lib/job-overlap";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

dayjs.locale("en");

function fmtTimeHHmm(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function toHHmmLabelFromFormatHours(formatHoursResult) {
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function isEditableStatus(s) {
  return s === "saved" || s === "updated";
}

function formatReturnMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} h`;
  return `${hours} h ${remainder}`;
}


// Delays (seconds) between automatic resends of a save that failed on a network/server outage.
const AUTO_RESEND_DELAYS_S = [15, 30, 60, 120, 240];

export default function EmployeeForm() {
  const { user, role } = useAuth();
  const isManager = isManagerRole(String(role || "").toLowerCase());
  const { isViewMode, viewedEmployee } = useViewMode();
  const effectiveUserId = isViewMode ? viewedEmployee.id : user?.id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = useT();

  const editId = searchParams.get("edit");

  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editLoadFailed, setEditLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  // Set when the opened job was created by management and still needs the employee's confirmation.
  const [managerEntryBy, setManagerEntryBy] = useState(null);
  const [warning, setWarning] = useState("");

  const [job_date, setJobDate] = useState(companyDate());
  const [ot, setOt] = useState("");
  const [depart, setDepart] = useState("");
  const [arrivee, setArrivee] = useState("");
  const [fin, setFin] = useState("");
  const [km_aller, setKmAller] = useState("");

  // dirty = the form has unsaved changes. Reset on load/save, set on edit.
  const [dirty, setDirty] = useState(false);

  const [locked, setLocked] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const imageInputRef = useRef(null);
  const overtimeInputRef = useRef(null);
  const parkingInputRef = useRef(null);
  const lastSaveErrorRef = useRef("");
  const lastSaveFailureRef = useRef(null); // raw error of the last failed save (offline vs refused)
  // Automatic resend after a network / server outage: { minutes, km, mode, attempt, fieldsKey }.
  const [autoResend, setAutoResend] = useState(null);
  const loadedReturnRef = useRef({ minutes: 0, km: 0 });
  const autoSubmitDoneRef = useRef(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  // C-3: synchronous double-tap guard (React `saving` state updates async, too late for a
  // fast second tap) + a per-new-entry idempotency key reused across retries so a timeout
  // that still commits, or a double submit, upserts one row instead of duplicating it.
  const savingRef = useRef(false);
  const submissionKeyRef = useRef(null);
  const [showAutofillTip, setShowAutofillTip] = useState(false);
  const [autofillTipPage, setAutofillTipPage] = useState(1);
  // Problems found on the last Field Service screenshot (workOrderIssues). While any remain, the
  // new entry cannot be saved: the employee fixes the work order and retakes the screenshot.
  const [workOrderProblems, setWorkOrderProblems] = useState([]);
  const [showWorkOrderCheck, setShowWorkOrderCheck] = useState(false);
  const [returnStep, setReturnStep] = useState("closed");
  const [returnMinutes, setReturnMinutes] = useState(null);
  const [returnKm, setReturnKm] = useState("");
  const [pendingReturn, setPendingReturn] = useState(null);
  const [pendingEvidenceJobId, setPendingEvidenceJobId] = useState(null);
  const pendingEvidence = useRef(null); // { jobId, evidenceId } of a proof committed before a later step failed
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [failedEvidenceFile, setFailedEvidenceFile] = useState(null); // kept so "Réessayer" needs no re-pick
  const [evidenceValidationError, setEvidenceValidationError] = useState("");
  const [showOvertimeExample, setShowOvertimeExample] = useState(false);
  const [returnSaveError, setReturnSaveError] = useState("");
  const [returnCheckBusy, setReturnCheckBusy] = useState(false);
  const [overtimeDailyMinutes, setOvertimeDailyMinutes] = useState(0);
  const [hasOvertimeEvidence, setHasOvertimeEvidence] = useState(false);
  const [parkingRequested, setParkingRequested] = useState(false);
  const [parkingFile, setParkingFile] = useState(null);
  const [parkingAmount, setParkingAmount] = useState("");
  const [hasParkingReceipt, setHasParkingReceipt] = useState(false);
  const [parkingReceiptsEnabled, setParkingReceiptsEnabled] = useState(false);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  // Administration (office, non-CCQ) employees log a simplified timesheet: no
  // auto-fill, no Arrivée, "Départ" is labelled "Début", and no kilometres.
  const [officeEmployee, setOfficeEmployee] = useState(false);
  // "First trip unpaid" employees reach the 8 h overtime-screenshot threshold on PAID time.
  // Until the profile loads this stays false, i.e. the stricter gross-time rule applies.
  const [firstTripUnpaid, setFirstTripUnpaid] = useState(false);
  const [entryBlockedReason, setEntryBlockedReason] = useState("");
  const [pendingSaveMode, setPendingSaveMode] = useState("draft");
  const [draftReady, setDraftReady] = useState(false);
  // End-of-shift flow: "last work order of the day" -> return to the shop -> overtime proof
  // (if >8 h) -> three inventory screenshots -> submit the day. The date is kept in a ref
  // because the form fields are reset as soon as the job is saved.
  const endShiftRef = useRef(false);
  const endShiftDateRef = useRef(null);
  const inventoryInputRef = useRef(null);
  const inventorySlotRef = useRef(null);
  const daySubmitRef = useRef(false);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [inventoryBusySlot, setInventoryBusySlot] = useState(null);
  const [inventoryError, setInventoryError] = useState("");
  const [showInventoryExamples, setShowInventoryExamples] = useState(false);
  const [daySubmitBusy, setDaySubmitBusy] = useState(false);
  const [daySubmitError, setDaySubmitError] = useState("");

  const [status, setStatus] = useState("");
  const statusLabel = editId ? (status || "saved") : "new";

  const departDj = useMemo(() => makeDayjsFromJob(job_date, depart), [job_date, depart]);
  const finDj = useMemo(() => makeDayjsFromJob(job_date, fin), [job_date, fin]);
  const hoursDecimal = useMemo(() => hoursBetween(departDj, finDj) || 0, [departDj, finDj]);
  const hoursLabel = useMemo(
    () => toHHmmLabelFromFormatHours(formatHours(hoursDecimal)),
    [hoursDecimal]
  );

  function restoreLocalDraft(record) {
    const draft = record?.data;
    if (!draft) return;
    setJobDate(draft.job_date || companyDate());
    setOt(draft.ot || "");
    setDepart(draft.depart || "");
    setArrivee(draft.arrivee || "");
    setFin(draft.fin || "");
    setKmAller(draft.km_aller || "");
    setReturnMinutes(draft.returnMinutes ?? null);
    setReturnKm(draft.returnKm || "");
    setParkingRequested(Boolean(draft.parkingRequested));
    setParkingAmount(draft.parkingAmount || "");
    setPendingSaveMode(draft.pendingSaveMode || "draft");
    setWorkOrderProblems(Array.isArray(draft.workOrderProblems) ? draft.workOrderProblems : []);
    if (record.submissionKey) submissionKeyRef.current = record.submissionKey;
    setDirty(true);
    setDraftRestored(true);
    setInfo(t("form.toasts.draftRestored"));
  }

  // Lets the employee throw away a restored local draft and start from a clean form
  // (new entry) or from the server copy (existing entry).
  async function discardLocalDraft() {
    if (!(await confirm(t("form.draft.discardConfirm")))) return;
    await deleteDraft({ userId: effectiveUserId, ...(editId ? { editId } : {}) }).catch(() => undefined);
    setDraftRestored(false);
    if (editId) {
      await loadEdit();
      return;
    }
    resetNewJobFields();
    submissionKeyRef.current = crypto.randomUUID();
  }

  async function loadEdit() {
    if (!editId || !effectiveUserId) return;

    setErr("");
    setInfo("");
    setDraftRestored(false);
    setWarning("");
    setLoadingEdit(true);
    setEditLoadFailed(false);

    try {
      const { data, error } = await withRetry(
        () => supabase.from("jobs").select("*").eq("id", editId).single(),
        12000
      );
      if (error) throw error;
      if (!data) throw new Error(t("form.errors.notFound"));
      if (data.user_id !== effectiveUserId) throw new Error(t("form.errors.notAuthorized"));

      setManagerEntryBy(isPendingManagerEntry(data) ? (data.manager_entry_by_name || t("audit.someone")) : null);
      setJobDate(data.job_date || companyDate());
      setOt(data.ot || "");
      setDepart(fmtTimeHHmm(data.depart) || "");
      setArrivee(fmtTimeHHmm(data.arrivee) || "");
      setFin(fmtTimeHHmm(data.fin) || "");
      setHasOvertimeEvidence(Boolean(data.overtime_evidence_captured));
      loadedReturnRef.current = {
        minutes: Number(data.return_time_minutes) || 0,
        km: Number(data.km_retour) || 0,
      };
      setParkingRequested(Boolean(data.parking_receipt_captured));
      setHasParkingReceipt(Boolean(data.parking_receipt_captured));
      setParkingFile(null);

      setKmAller(kilometreFieldValue(data));
      if (data.parking_receipt_captured) {
        const { data: parkingReceipt } = await withTimeout(
          supabase.from("parking_receipts").select("amount").eq("job_id", data.id).maybeSingle(),
          10000
        );
        setParkingAmount(parkingReceipt?.amount == null ? "" : String(parkingReceipt.amount));
      } else {
        setParkingAmount("");
      }

      const s = (data.status || "saved").trim();
      setStatus(s);

      const shouldLock = Boolean(data.locked) || !isEditableStatus(s);
      setLocked(shouldLock);
      setDirty(false);
      const localDraft = await loadDraft({ userId: effectiveUserId, editId }).catch(() => null);
      if (localDraft) {
        const draftIsNewer = Date.parse(localDraft.updatedAt) > Date.parse(data.updated_at || 0);
        if (draftIsNewer && await confirm(t("form.draft.restoreNewer"))) {
          restoreLocalDraft(localDraft);
        } else if (!draftIsNewer) {
          await deleteDraft({ userId: effectiveUserId, editId }).catch(() => undefined);
        }
      }
    } catch (e) {
      setErr(isOfflineError(e) ? "" : friendlyErrorMessage(e, t, "form.errors.failedLoad"));
      setEditLoadFailed(true);
      const localDraft = await loadDraft({ userId: effectiveUserId, editId }).catch(() => null);
      if (localDraft) {
        restoreLocalDraft(localDraft);
        setErr("");
      }
    } finally {
      setLoadingEdit(false);
      setDraftReady(true);
    }
  }

  // "New job" defaults, so a previous job's data doesn't bleed into the next entry.
  function resetNewJobFields() {
    setJobDate(companyDate());
    setOt("");
    setDepart("");
    setArrivee("");
    setFin("");
    setKmAller("");
    setStatus("");
    setLocked(false);
    setErr("");
    setInfo("");
    setDraftRestored(false);
    setWarning("");
    setEditLoadFailed(false);
    setDirty(false);
    setManagerEntryBy(null);
    setHasOvertimeEvidence(false);
    setParkingRequested(false);
    setHasParkingReceipt(false);
    setParkingFile(null);
    setParkingAmount("");
    setWorkOrderProblems([]);
    setShowWorkOrderCheck(false);
  }

  // A closed day also disables the date field, so this is the way back to today's job card.
  async function returnToTodaysJobCard() {
    if (editId) {
      navigate("/form", { replace: true });
      return;
    }
    await deleteDraft({ userId: effectiveUserId }).catch(() => undefined);
    resetNewJobFields();
    submissionKeyRef.current = crypto.randomUUID();
  }

  useEffect(() => {
    setDraftReady(false);
    if (editId) {
      loadEdit();
    } else {
      resetNewJobFields();
      loadDraft({ userId: effectiveUserId }).then((record) => {
        if (record) restoreLocalDraft(record);
      }).catch(() => undefined).finally(() => setDraftReady(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, effectiveUserId]);

  // A fresh idempotency key per new-entry form. Edits identify and lock the existing row;
  // within one new-entry flow the key remains stable through retries and attachments.
  useEffect(() => {
    submissionKeyRef.current = editId ? null : crypto.randomUUID();
  }, [editId, effectiveUserId]);

  useEffect(() => {
    if (!draftReady || !dirty || !effectiveUserId || isViewMode || locked) return;
    const timeoutId = window.setTimeout(() => {
      persistDraft({
        userId: effectiveUserId,
        editId,
        submissionKey: submissionKeyRef.current,
        data: {
          job_date, ot, depart, arrivee, fin, km_aller,
          returnMinutes, returnKm, parkingRequested, parkingAmount, pendingSaveMode, workOrderProblems,
        },
      }).catch((error) => console.warn("[draft] local save failed", error));
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [draftReady, dirty, effectiveUserId, editId, isViewMode, locked, job_date, ot, depart, arrivee, fin, km_aller, returnMinutes, returnKm, parkingRequested, parkingAmount, pendingSaveMode, workOrderProblems]);

  useEffect(() => {
    if (!effectiveUserId) return;
    supabase.from("profiles").select("role, parking_receipts_enabled, inventory_screenshots_enabled, first_trip_unpaid").eq("id", effectiveUserId).single().then(({ data, error }) => {
      if (error) {
        setErr(isOfflineError(error) ? "" : friendlyErrorMessage(error, t, "form.errors.failedLoad"));
        return;
      }
      setOfficeEmployee(isAdminEmployee(data?.role));
      setFirstTripUnpaid(Boolean(data?.first_trip_unpaid));
      setInventoryEnabled(Boolean(data?.inventory_screenshots_enabled));
      const enabled = Boolean(data?.parking_receipts_enabled);
      setParkingReceiptsEnabled(enabled);
      if (!enabled) {
        setParkingRequested(false);
        setParkingFile(null);
      }
    });
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId || !job_date) return;
    let cancelled = false;
    async function checkEntryWindow() {
      // Managers are never blocked by the entry deadline or holidays; the
      // database trigger already exempts them, so mirror that in the UI.
      if (isManager) return setEntryBlockedReason("");
      const [{ data: settings }, { data: holiday }, { data: unlock }] = await Promise.all([
        supabase.from("company_time_settings").select("daily_deadline, timezone").eq("id", true).single(),
        supabase.from("company_holidays").select("holiday_date, label").eq("holiday_date", job_date).maybeSingle(),
        supabase.from("job_entry_unlocks").select("unlocked_until").eq("user_id", effectiveUserId).eq("job_date", job_date).maybeSingle(),
      ]);
      if (cancelled) return;
      const unlocked = Boolean(unlock && (!unlock.unlocked_until || dayjs(unlock.unlocked_until).isAfter(dayjs())));
      if (unlocked) return setEntryBlockedReason("");
      if (holiday) return setEntryBlockedReason(t("form.deadline.holiday", { name: holiday.label }));

      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings?.timezone || COMPANY_TIME_ZONE,
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
      const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
      const localDate = `${parts.year}-${parts.month}-${parts.day}`;
      const localMinute = `${parts.hour}:${parts.minute}`;
      const deadline = String(settings?.daily_deadline || "23:59").slice(0, 5);
      const blocked = job_date < localDate || (job_date === localDate && localMinute > deadline);
      setEntryBlockedReason(blocked ? t("form.deadline.passed", { time: deadline }) : "");
    }
    checkEntryWindow();
    return () => { cancelled = true; };
  }, [job_date, t, effectiveUserId, isManager]);

  // Saving is the only action on this form: it first asks whether this is the last work
  // order of the day. Submitting the day happens at the end of that flow (or from History).
  function saveDraft() {
    if (workOrderBlocked) { setShowWorkOrderCheck(true); return; }
    setPendingSaveMode("draft");
    setReturnMinutes(null);
    setReturnKm("");
    endShiftRef.current = false;
    endShiftDateRef.current = null;
    setReturnStep("last");
  }

  function answerLastJob(isLast) {
    endShiftRef.current = isLast;
    endShiftDateRef.current = isLast ? job_date : null;
    // Office employees don't travel to sites, so skip the warehouse-return (time + km)
    // question; field employees continue to it only on their last job of the day.
    if (isLast && !officeEmployee) { setReturnStep("ask"); return; }
    return saveWithReturn(0, 0, "draft");
  }

  // `evidence` ({ evidenceId, storagePath, dailyMinutes }) saves the job, its overtime proof
  // and the manager notification in one transaction (save_own_job_with_overtime_evidence).
  async function saveJob(mode, returnValues = null, forcedId = null, evidence = null) {
    if (isViewMode) return false;
    if (!user?.id) {
      setErr(t("form.errors.notSignedIn"));
      return;
    }
    if (saving || savingRef.current) return; // sync guard blocks a rapid double-tap
    if (entryBlockedReason) {
      lastSaveErrorRef.current = entryBlockedReason;
      setErr(entryBlockedReason);
      return false;
    }
    const parkingAmountNumber = normalizeNumber(parkingAmount);
    if (parkingRequested && (!parkingAmountNumber || parkingAmountNumber <= 0 || parkingAmountNumber > 20)) {
      setErr(t("form.parking.amountRequired"));
      return false;
    }
    if (parkingRequested && !parkingFile && !hasParkingReceipt) {
      setErr(t("form.parking.receiptRequired"));
      parkingInputRef.current?.click();
      return false;
    }

    let overlapWarning = null;
    try {
      const fromDate = dayjs(job_date).subtract(1, "day").format("YYYY-MM-DD");
      const toDate = dayjs(job_date).add(1, "day").format("YYYY-MM-DD");
      const { data: possibleConflicts, error: overlapLoadError } = await withTimeout(
        supabase.from("jobs")
          .select("id, ot, job_date, depart, fin, status")
          .eq("user_id", user.id)
          .in("status", ["saved", "updated", "submitted", "approved"])
          .gte("job_date", fromDate)
          .lte("job_date", toDate),
        8000
      );
      if (overlapLoadError) throw overlapLoadError;
      overlapWarning = jobOverlapDetails({ id: editId, ot, job_date, depart, fin }, possibleConflicts, t);
    } catch {
      // Saving remains available if this advisory check cannot load. The database
      // still enforces submitted/approved overlaps during submission.
    }
    if (mode === "submit" && overlapWarning) {
      lastSaveErrorRef.current = overlapWarning;
      setErr(overlapWarning);
      setWarning("");
      return false;
    }

    setErr("");
    setInfo("");
    setWarning("");
    lastSaveFailureRef.current = null;
    savingRef.current = true; // set synchronously (before the first await) — see the guard above
    setSaving(true);

    try {
      const kmTotalNum = normalizeNumber(km_aller) ?? 0;
      const kmReturnNum = Number(returnValues?.km) || 0;
      if (kmReturnNum > kmTotalNum) throw new Error(t("form.return.kmExceedsTotal"));
      const kmClientNum = Math.max(0, kmTotalNum - kmReturnNum);

      let nextStatus = "saved";

      if (mode === "submit") {
        nextStatus = "submitted";
      } else {
        if (!editId) {
          nextStatus = "saved";
        } else {
          const current = (status || "saved").trim();
          nextStatus = isEditableStatus(current) ? "updated" : current;
        }
      }

      if (mode === "submit") {
        const contractErrors = validateJobSubmissionContract({
          depart,
          fin,
          job_date,
          return_time_minutes: returnValues?.minutes ?? 0,
          km_total: kmTotalNum,
          km_aller: kmClientNum,
          km_retour: kmReturnNum,
        });
        if (contractErrors.length) {
          throw new Error(`invalid_job_contract:${contractErrors.join(",")}`);
        }
      }

      // The database owns the state transition and transaction. The idempotency key is
      // reused across retries, so a response lost after commit resolves to the same row.
      if (!editId && !submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID();
      const jobFields = {
        editId,
        newJobId: forcedId,
        submissionKey: submissionKeyRef.current,
        submit: mode === "submit",
        jobDate: job_date,
        ot,
        depart,
        arrivee,
        fin,
        kmTotal: kmTotalNum,
        kmAller: kmClientNum,
        returnMinutes: returnValues?.minutes,
        kmRetour: kmReturnNum,
        overtimeEvidenceCaptured: hasOvertimeEvidence,
        parkingReceiptCaptured: hasParkingReceipt,
      };
      const { data } = await withRetry(
        () => (evidence
          ? supabase.rpc("save_own_job_with_overtime_evidence", buildJobSaveWithEvidenceRpcArgs({ ...jobFields, ...evidence }))
          : supabase.rpc("save_own_job", buildJobSaveRpcArgs(jobFields))
        ).single(),
        12000
      );
      if (!data?.id) throw new Error(t("form.errors.insertNoId"));

      const savedJobId = data.id;
      setInfo(editId
        ? (nextStatus === "submitted" ? "form.toasts.submitted" : "form.toasts.updated")
        : (nextStatus === "submitted" ? "form.toasts.savedAndSubmitted" : "form.toasts.saved"));
      setStatus(data.status || nextStatus);
      setLocked(Boolean(data.locked));
      setDirty(false);
      setWarning(overlapWarning || "");

      if (!editId && !returnValues) navigate(`/form?edit=${savedJobId}`, { replace: true });
      if (parkingRequested && parkingFile) {
        await uploadParkingReceipt(savedJobId, parkingFile, parkingAmountNumber);
        setHasParkingReceipt(true);
        setParkingFile(null);
      }
      await deleteDraft({ userId: effectiveUserId, editId }).catch(() => undefined);
      return savedJobId;
    } catch (e) {
      lastSaveFailureRef.current = e;
      // Postgres unique_violation = "23505". Map it to a friendly message
      // since the raw "duplicate key value violates unique constraint…" is
      // useless to an employee.
      const code = e?.code || e?.cause?.code;
      const msg = String(e?.message || "");
      if (isJobOverlapError(e)) {
        let overlapMessage = null;
        try {
          const fromDate = dayjs(job_date).subtract(1, "day").format("YYYY-MM-DD");
          const toDate = dayjs(job_date).add(1, "day").format("YYYY-MM-DD");
          const { data: possibleConflicts } = await withTimeout(
            supabase.from("jobs")
              .select("id, ot, job_date, depart, fin, status")
              .eq("user_id", user.id)
              .in("status", ["submitted", "approved"])
              .gte("job_date", fromDate)
              .lte("job_date", toDate),
            8000
          );
          overlapMessage = jobOverlapMessage(e, { id: editId, ot, job_date, depart, fin }, possibleConflicts, t);
        } catch {
          // Keep the existing translated generic overlap error if details cannot load.
        }
        lastSaveErrorRef.current = overlapMessage || friendlyErrorMessage(e, t, "form.errors.saveFailed");
      } else if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        lastSaveErrorRef.current = t("form.errors.duplicateOt", { ot: ot || "" });
      } else {
        lastSaveErrorRef.current = friendlyErrorMessage(e, t, "form.errors.saveFailed");
      }
      setErr(isOfflineError(e) ? "" : lastSaveErrorRef.current);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function uploadParkingReceipt(jobId, file, amount) {
    const receiptId = crypto.randomUUID();
    const storagePath = `${user.id}/${job_date}/${receiptId}.jpg`;
    const image = await prepareEvidenceImage(file);
    // Every call is timed out so a bad connection surfaces a retryable error instead of
    // freezing the save button forever.
    const { error: uploadError } = await withTimeout(
      supabase.storage.from("parking-receipts").upload(storagePath, image, { contentType: "image/jpeg", upsert: false }),
      20000
    );
    if (uploadError) throw uploadError;

    const { data: savedReceipt, error: receiptError } = await withTimeout(
      supabase.from("parking_receipts").upsert({
        job_id: jobId,
        user_id: user.id,
        job_date,
        storage_path: storagePath,
        amount,
      }, { onConflict: "job_id" }).select("id").single(),
      12000
    );
    if (receiptError) {
      await supabase.storage.from("parking-receipts").remove([storagePath]).catch(() => undefined);
      throw receiptError;
    }
    const { error: notificationError } = await withTimeout(
      supabase.from("manager_notifications").insert({
        type: "parking_receipt",
        employee_id: user.id,
        job_id: jobId,
        parking_receipt_id: savedReceipt.id,
        daily_minutes: 0,
      }),
      12000
    );
    if (notificationError) throw notificationError;
  }

  function handleParkingReceipt(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      if (!hasParkingReceipt) setParkingRequested(false);
      return;
    }
    setParkingFile(file);
    setParkingRequested(true);
    setDirty(true);
  }

  // Arriving from History with ?submit=1 (day over 8 h, no proof yet): once the job
  // is loaded, run the normal submit flow so the screenshot pop-up opens by itself.
  useEffect(() => {
    if (searchParams.get("submit") !== "1") return;
    if (!editId || autoSubmitDoneRef.current) return;
    if (loadingEdit || !draftReady || editLoadFailed || locked || isViewMode) return;
    autoSubmitDoneRef.current = true;
    // Coming from History to submit a day: run the end-of-shift flow for this job's day.
    endShiftRef.current = true;
    endShiftDateRef.current = job_date;
    setPendingSaveMode("draft");
    saveWithReturn(loadedReturnRef.current.minutes, loadedReturnRef.current.km, "draft");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loadingEdit, draftReady, editLoadFailed, locked, isViewMode]);

  const entryFieldsKey = [job_date, ot, depart, arrivee, fin, km_aller].join("|");
  // The employee changed the entry since the failure: their next Save decides, nothing is resent.
  const pendingResend = autoResend && autoResend.fieldsKey === entryFieldsKey ? autoResend : null;
  useEffect(() => {
    if (!pendingResend) return undefined;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      saveWithReturn(pendingResend.minutes, pendingResend.km, pendingResend.mode, pendingResend.attempt + 1);
    };
    window.addEventListener("online", fire);
    // Offline: wait for the connection. Online (server outage): retry after a growing delay.
    const timer = navigator.onLine === false ? null : setTimeout(fire, AUTO_RESEND_DELAYS_S[pendingResend.attempt] * 1000);
    return () => { window.removeEventListener("online", fire); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResend]);

  // A save that failed on a network loss or a server outage (not a refusal) is resent by
  // itself: the entry stays on the device and the RPC is idempotent (same submission key),
  // so a resend can never create a second job. Stops when the employee edits the entry.
  function scheduleAutoResend(error, minutes, km, mode, attempt) {
    if (savingRef.current) return; // another save is running: it decides
    if (classifyApiError(error) !== "transient" || attempt >= AUTO_RESEND_DELAYS_S.length) {
      setAutoResend(null);
      return;
    }
    setAutoResend({ minutes, km, mode, attempt, fieldsKey: entryFieldsKey });
  }

  async function saveWithReturn(minutes, km, requestedMode = pendingSaveMode, resendAttempt = 0) {
    setAutoResend(null);
    setReturnSaveError("");
    setReturnCheckBusy(true);
    const returnValues = { minutes, km };
    let needsEvidence;
    try {
      needsEvidence = requiresEvidenceBeforeSave(requestedMode)
        ? await requiresOvertimeEvidence()
        : false;
    } catch (error) {
      const message = friendlyErrorMessage(error, t, "form.errors.saveFailed");
      lastSaveErrorRef.current = message;
      setErr(isOfflineError(error) ? "" : message);
      setReturnSaveError(message);
      scheduleAutoResend(error, minutes, km, requestedMode, resendAttempt);
      return;
    } finally {
      setReturnCheckBusy(false);
    }
    if (needsEvidence) {
      setPendingReturn(returnValues);
      setReturnStep("evidence");
      return;
    }
    const saved = await saveJob(requestedMode, returnValues);
    if (!saved) {
      setReturnSaveError(lastSaveErrorRef.current || t("form.return.saveError"));
      scheduleAutoResend(lastSaveFailureRef.current, minutes, km, requestedMode, resendAttempt);
      return;
    }

    if (await shouldRequestMealClaim(saved)) {
      await createMealClaim(saved);
    }
    if (!editId) submissionKeyRef.current = null;
    await finishAfterSave();
    if (editId) {
      navigate("/form", { replace: true });
    } else {
      setJobDate(companyDate());
      setOt("");
      setDepart("");
      setArrivee("");
      setFin("");
      setKmAller("");
      setStatus("");
      setLocked(false);
      setDirty(false);
      setInfo("");
      setParkingRequested(false);
      setParkingFile(null);
      setHasParkingReceipt(false);
    }
  }

  // Last step after a job (and its proof) is stored: either the plain "saved" message, or
  // the end-of-shift inventory capture / day submission.
  async function finishAfterSave() {
    if (!endShiftRef.current) {
      setReturnStep("success");
      return;
    }
    setInventoryError("");
    setDaySubmitError("");
    if (officeEmployee || !inventoryEnabled) {
      setReturnStep("dayDone");
      return;
    }
    try {
      const rows = await fetchInventorySlots(supabase, user.id, endShiftDateRef.current);
      setInventoryRows(rows);
      setReturnStep(missingInventorySlots(rows).length ? "inventory" : "dayDone");
    } catch (error) {
      setInventoryRows([]);
      setInventoryError(friendlyErrorMessage(error, t, "form.errors.failedLoad"));
      setReturnStep("inventory");
    }
  }

  function closeReturnDialog() {
    endShiftRef.current = false;
    endShiftDateRef.current = null;
    setReturnStep("closed");
    setShowOvertimeExample(false);
    setShowInventoryExamples(false);
  }

  function pickInventorySlot(slot) {
    inventorySlotRef.current = slot;
    inventoryInputRef.current?.click();
  }

  async function handleInventoryFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const slot = inventorySlotRef.current;
    if (!file || !slot || inventoryBusySlot) return;
    setInventoryBusySlot(slot);
    setInventoryError("");
    try {
      let retentionDays = 30;
      try {
        const { data } = await withTimeout(
          supabase.from("overtime_settings").select("evidence_retention_days").eq("id", true).maybeSingle(),
          8000
        );
        retentionDays = Number(data?.evidence_retention_days) || 30;
      } catch { /* default retention applies */ }
      const previousPath = inventoryRows.find((row) => row.slot === slot)?.storage_path || null;
      const path = await saveInventoryScreenshot(supabase, {
        userId: user.id,
        jobDate: endShiftDateRef.current,
        slot,
        file,
        retentionDays,
        previousPath,
      });
      setInventoryRows((rows) => [...rows.filter((row) => row.slot !== slot), { slot, storage_path: path }]);
    } catch (error) {
      console.error("[inventory] screenshot failed", error);
      const failure = evidenceUploadFailure(error);
      setInventoryError(`${t("form.inventory.uploadFailed")} ${t("form.evidence.reasonLabel")} ${t(`form.evidence.reason.${failure.key}`)}`);
    } finally {
      setInventoryBusySlot(null);
    }
  }

  // Submits every editable job of the end-of-shift day. Retrying is safe: only jobs still
  // saved/updated are sent, and each goes through the idempotent save_own_job RPC.
  async function submitEndOfDay() {
    if (daySubmitRef.current) return;
    daySubmitRef.current = true;
    setDaySubmitBusy(true);
    setDaySubmitError("");
    try {
      const { data, error } = await withTimeout(
        supabase.from("jobs").select("*")
          .eq("user_id", user.id)
          .eq("job_date", endShiftDateRef.current)
          .in("status", ["saved", "updated"])
          .eq("locked", false)
          .order("depart", { ascending: true }),
        12000
      );
      if (error) throw error;
      // Jobs created by management are only submitted when the employee confirmed them in
      // History (carried in ?confirmed=); otherwise they stay there awaiting validation.
      const confirmedIds = new Set((searchParams.get("confirmed") || "").split(",").filter(Boolean));
      let awaitingConfirmation = 0;
      for (const job of data || []) {
        if (isPendingManagerEntry(job) && !confirmedIds.has(job.id)) {
          awaitingConfirmation += 1;
          continue;
        }
        await submitSavedJob(supabase, job, { confirmManagerEntry: isPendingManagerEntry(job) });
      }
      if (awaitingConfirmation > 0) setWarning(t("form.managerEntry.skipped", { count: awaitingConfirmation }));
      setReturnStep("daySubmitted");
    } catch (error) {
      setDaySubmitError(isOfflineError(error) ? t("offline.banner") : friendlyErrorMessage(error, t, "history.errors.submitDayFailed"));
    } finally {
      daySubmitRef.current = false;
      setDaySubmitBusy(false);
    }
  }

  async function requiresOvertimeEvidence() {
    // CCQ overtime authorization (the screenshot) does not apply to office staff.
    if (officeEmployee) return false;
    // Known locally without any network call, so it stays valid even if the
    // day-jobs lookup below fails.
    const thisMinutes = Math.round(hoursDecimal * 60);
    try {
      // Retry (with a session refresh + backoff) so a Supabase free-tier cold
      // start doesn't fail the check on the first slow attempt.
      const { data: dayJobs } = await withRetry(
        () => supabase.from("jobs").select("id, depart, arrivee, fin, overtime_evidence_captured").eq("user_id", user.id).eq("job_date", job_date),
        8000,
        { retries: 2 }
      );
      if (editId && hasOvertimeEvidence) return false;
      const workedMinutes = (job) => {
        const start = makeDayjsFromJob(job_date, job.depart);
        const end = makeDayjsFromJob(job_date, job.fin);
        return Math.round((hoursBetween(start, end) || 0) * 60);
      };
      const others = (dayJobs || []).filter((job) => job.id !== editId);
      // Full day (all jobs) drives supper eligibility. Return-to-storage time is
      // deliberately excluded: it is always paid at the regular rate and never
      // creates overtime or supper eligibility.
      const fullDayMinutes = others.reduce((total, job) => total + workedMinutes(job), 0) + thisMinutes;
      // With the "first trip unpaid" option the day's first Départ→Arrivée trip is not paid:
      // supper eligibility, the overtime threshold and the stored daily total all use PAID
      // time (same rule as the payroll and the database).
      const unpaidTrip = firstTripUnpaid
        ? dayFirstTripUnpaidMinutes([...others, { id: editId || "current", depart, arrivee, fin }])
        : 0;
      const paidDayMinutes = fullDayMinutes - unpaidTrip;
      setOvertimeDailyMinutes(paidDayMinutes);
      // The overtime authorization is one screenshot per day. If another job
      // today already has it, don't ask again for this one.
      if (others.some((job) => job.overtime_evidence_captured)) return false;
      // Require the screenshot whenever the WHOLE day (all of the employee's jobs
      // that day, this one included) passes 8h — not just this job's chronological
      // running total. A day split across several short jobs still needs one
      // authorization: whichever job is being saved when the running day total
      // crosses 8h asks for it (the once-per-day guard above prevents a second
      // prompt, and the manager also sees an "8h+, no evidence" flag at approval
      // as a backstop for jobs that were entered out of order).
      return paidDayMinutes > 480;
    } catch (error) {
      // Submission must fail closed: without the other jobs we cannot prove that
      // the complete day is at or below 8 h.
      console.error("[overtime evidence] day-jobs check failed; submission blocked", error);
      throw error;
    }
  }

  async function shouldRequestMealClaim(jobId) {
    // Meal (supper) claims are a CCQ field-crew benefit; office staff are non-CCQ.
    if (officeEmployee) return false;
    // Supper: 2 h 15 of overtime (1.5× or 2×) = at least 10 h 15 of paid work that day, return
    // time never counted. Decided from the employee's saved jobs of the day (this one included).
    const [{ data: dayJobs, error: dayError }, { data: policy, error: policyError }] = await Promise.all([
      withTimeout(
        supabase.from("jobs").select("id, job_date, depart, arrivee, fin, return_time_minutes").eq("user_id", user.id).eq("job_date", job_date),
        10000
      ),
      withTimeout(
        supabase.from("profiles").select("first_trip_unpaid").eq("id", user.id).maybeSingle(),
        10000
      ),
    ]);
    if (dayError) throw dayError;
    if (policyError) throw policyError;
    if (!mealDecision(dayJobs || [], job_date, policy).eligible) return false;
    const { data, error } = await withTimeout(
      supabase.from("meal_claims").select("id").eq("user_id", user.id).eq("job_date", job_date).limit(1),
      10000
    );
    if (error) throw error;
    return (data || []).length === 0 && Boolean(jobId);
  }

  async function createMealClaim(jobId) {
    try {
      const claimId = crypto.randomUUID();
      const { error: claimError } = await withTimeout(
        supabase.from("meal_claims").insert({
          id: claimId,
          user_id: user.id,
          job_id: jobId,
          job_date,
          amount: 30,
          status: "pending",
          storage_path: null,
          daily_work_minutes: overtimeDailyMinutes,
        }),
        12000
      );
      if (claimError) throw claimError;
      const { error: mealFlagError } = await withTimeout(
        supabase.from("jobs").update({ meal_claim_captured: true }).eq("id", jobId),
        12000
      );
      if (mealFlagError) throw mealFlagError;
      const { error: notificationError } = await withTimeout(
        supabase.from("manager_notifications").insert({
          type: "meal_claim",
          employee_id: user.id,
          job_id: jobId,
          meal_claim_id: claimId,
          daily_minutes: overtimeDailyMinutes,
        }),
        12000
      );
      if (notificationError) throw notificationError;
      return true;
    } catch (error) {
      setErr(isOfflineError(error) ? "" : friendlyErrorMessage(error, t, "form.meal.failed"));
      return false;
    }
  }

  // Uploads the screenshot; on an expired session, timeout or network drop it refreshes the
  // session and retries once. A duplicate on the retry means the first attempt did commit.
  async function uploadEvidenceWithRefresh(path, image) {
    const attempt = () => withTimeout(
      supabase.storage.from("overtime-evidence").upload(path, image, { contentType: "image/jpeg", upsert: false }),
      20000
    );
    try {
      const { error } = await attempt();
      if (error) throw error;
    } catch (firstError) {
      if (!["auth", "timeout", "network"].includes(evidenceUploadFailure(firstError).key)) throw firstError;
      await refreshSessionOnce();
      const { error } = await attempt();
      const duplicate = Number(error?.statusCode ?? error?.status) === 409 || /already exists|duplicate/i.test(error?.message || "");
      if (error && !duplicate) throw error;
    }
  }

  function handleOvertimeEvidence(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    return processEvidenceFile(file);
  }

  async function processEvidenceFile(file) {
    if (!file) {
      setErr(t("form.evidence.fileMissing"));
      return;
    }
    if (!pendingReturn) {
      console.error("[overtime evidence] Missing return-to-shop values before file upload");
      setErr(t("form.evidence.returnMissing"));
      setReturnStep("evidence");
      return;
    }
    setEvidenceBusy(true);
    setErr("");
    setEvidenceValidationError("");
    setFailedEvidenceFile(null);

    const jobId = editId || crypto.randomUUID();
    // A proof already committed with its job (only the parking receipt failed afterwards)
    // is not uploaded or recorded again.
    const committed = pendingEvidenceJobId ? pendingEvidence.current : null;
    const evidenceId = committed?.evidenceId || crypto.randomUUID();
    const storagePath = `${user.id}/${job_date}/${evidenceId}.jpg`;
    let evidenceUploaded = false;
    try {
      let savedJobId = committed?.jobId || null;
      if (!committed) {
        try {
          const image = await prepareEvidenceImage(file);
          await uploadEvidenceWithRefresh(storagePath, image);
          evidenceUploaded = true;
        } catch (error) {
          console.error("[overtime evidence] Screenshot upload failed", error);
          const failure = evidenceUploadFailure(error);
          throw new Error(`${t("form.evidence.uploadFailed")} ${t("form.evidence.reasonLabel")} ${t(`form.evidence.reason.${failure.key}`)}${failure.detail ? ` (${failure.detail})` : ""}`, { cause: error });
        }

        // Job + proof row + manager notification in ONE transaction (migration 0084): a
        // failure leaves none of them, so a job can never claim a proof that was not recorded.
        savedJobId = await saveJob(pendingSaveMode, pendingReturn, jobId, { evidenceId, storagePath, dailyMinutes: overtimeDailyMinutes });
        if (!savedJobId) {
          // saveJob also fails when only the parking receipt (sent after the commit) fails.
          const { data: committedJob } = await withTimeout(
            supabase.from("jobs").select("id, overtime_evidence_captured").eq("id", jobId).maybeSingle(),
            8000
          ).catch(() => ({ data: null }));
          if (committedJob?.overtime_evidence_captured) {
            pendingEvidence.current = { jobId: committedJob.id, evidenceId };
            setPendingEvidenceJobId(committedJob.id);
            evidenceUploaded = false; // the file now belongs to a committed proof
          } else if (isOfflineError(lastSaveFailureRef.current)) {
            // The request may still commit: keep the file (the cleanup worker removes it if not).
            evidenceUploaded = false;
          }
          console.error("[overtime evidence] Atomic job + proof save failed", { jobId, reason: lastSaveErrorRef.current });
          throw new Error(lastSaveErrorRef.current || t("form.evidence.jobSaveFailed"));
        }
      } else if (parkingRequested && parkingFile) {
        try {
          await uploadParkingReceipt(savedJobId, parkingFile, normalizeNumber(parkingAmount));
          setHasParkingReceipt(true);
          setParkingFile(null);
        } catch (error) {
          console.error("[overtime evidence] Parking receipt retry failed", { savedJobId, error });
          throw new Error(error?.message || t("form.evidence.jobSaveFailed"), { cause: error });
        }
      }

      // Server-side OCR receives only the normalized JPEG and persists only its
      // classification, never the extracted conversation text.
      const { error: processingError } = await withTimeout(
        supabase.functions.invoke("process_overtime_evidence", { body: { evidence_id: evidenceId } }),
        12000
      );
      if (processingError) console.error("[overtime evidence] OCR queue failed", processingError);

      setPendingReturn(null);
      setPendingEvidenceJobId(null);
      pendingEvidence.current = null;
      setHasOvertimeEvidence(true);
      // The evidence is saved at this point. A failure while checking or
      // creating the automatic meal claim must not throw the user back to the
      // evidence step, so handle it separately and always move forward.
      try {
        if (await shouldRequestMealClaim(savedJobId)) await createMealClaim(savedJobId);
      } catch (mealError) {
        console.error("[overtime evidence] Meal claim step failed", mealError);
      }
      if (!editId) submissionKeyRef.current = null;
      await finishAfterSave();
      navigate("/form", { replace: true });
    } catch (error) {
      if (evidenceUploaded) {
        await supabase.storage.from("overtime-evidence").remove([storagePath]).catch(() => undefined);
      }
      setErr(error?.message || t("form.evidence.failed"));
      setFailedEvidenceFile(file);
      setReturnStep("evidence");
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function handleExtractFromImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setErr("");
    setInfo("");
    setExtracting(true);

    try {
      const text = await extractWorkOrderText(file);

      const d = parseExtractedText(text);

      if (d.job_date) setJobDate(String(d.job_date));
      if (d.ot) setOt(String(d.ot));
      if (d.depart) setDepart(String(d.depart));
      if (d.arrivee) setArrivee(String(d.arrivee));
      if (d.fin) setFin(String(d.fin));
      if (d.km_aller !== null && d.km_aller !== undefined) setKmAller(String(d.km_aller));
      // A required value missing or empty on the screenshot (likely empty in Field Service too),
      // or Miles Traveled ≠ Distance réelle parcourue: tell the employee to fix the work order.
      // Blocks Save until a new screenshot shows a complete work order.
      const problems = workOrderIssues(d);
      setWorkOrderProblems(problems);
      setShowWorkOrderCheck(problems.length > 0);
      // Auto-fill populated the form — mark dirty so Save appears
      setDirty(true);

      setInfo("form.toasts.filledFromImage");
    } catch (e) {
      setErr(e?.message || t("form.errors.extractFailed"));
    } finally {
      setExtracting(false);
    }
  }

  const disableInputs = isViewMode || locked || loadingEdit || saving || Boolean(entryBlockedReason);
  const badgeVariant = statusBadgeVariant(editId ? (status || "saved") : "new");

  // Save/Submit only appear once every field is filled — including parking
  // (amount + receipt) when the parking box is checked.
  const parkingComplete = !parkingRequested || (normalizeNumber(parkingAmount) > 0 && (Boolean(parkingFile) || hasParkingReceipt));
  // Office (administration) timesheets have no Arrivée and no kilometres, so those
  // two fields are not required to complete the form for them.
  const formComplete = Boolean(job_date) && Boolean(ot) && Boolean(depart) && Boolean(fin)
    && (officeEmployee || (Boolean(arrivee) && String(km_aller).trim() !== "")) && parkingComplete;
  const workOrderBlocked = !editId && workOrderProblems.length > 0;

  // Names of the required fields still empty, shown next to the disabled Save button.
  const missingFields = [
    !job_date && t("form.date"),
    !ot && t("form.ot"),
    !depart && (officeEmployee ? t("form.debut") : t("form.depart")),
    !officeEmployee && !arrivee && t("form.arrival"),
    !fin && t("form.end"),
    !officeEmployee && String(km_aller).trim() === "" && t("form.kmTotal"),
    !parkingComplete && t("form.parking.title"),
  ].filter(Boolean);

  return (
    <AppShell>
      <div className="space-y-2 sm:space-y-3">
        {err && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{err}</span>
            {editId && editLoadFailed && (
              <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={loadingEdit} onClick={loadEdit}>
                {t("common.retry")}
              </Button>
            )}
          </div>
        )}
        {pendingResend && (
          <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-info" role="status">
            {t("form.autoResend.pending", { attempt: pendingResend.attempt + 1, max: AUTO_RESEND_DELAYS_S.length })}
          </div>
        )}
        {managerEntryBy && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning" role="status">
            {t("form.managerEntry.banner", { name: managerEntryBy })}
          </div>
        )}
        {info && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <span>{t(info)}</span>
            {draftRestored && (
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={discardLocalDraft}>
                {t("form.draft.discard")}
              </Button>
            )}
          </div>
        )}
        {warning && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning" role="alert">
            {warning}
          </div>
        )}
        {entryBlockedReason && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
            <span>{entryBlockedReason}</span>
            {(editId || job_date !== companyDate()) && (
              <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={saving} onClick={returnToTodaysJobCard}>
                {t("form.deadline.backToJobCard")}
              </Button>
            )}
          </div>
        )}

        <Card>
          <CardContent className="space-y-2 p-3 sm:space-y-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-muted-foreground">{t("form.status")}</div>
              <Badge variant={badgeVariant} className="uppercase tracking-wide">
                {t(`status.${statusLabel}`)}
              </Badge>
            </div>

            {!locked && !editId && !officeEmployee && (
              <>
                <Button
                  type="button"
                  className="h-12 w-full text-base font-semibold"
                  disabled={disableInputs || extracting}
                  onClick={() => {
                    if (localStorage.getItem("autofill_tip_seen")) {
                      imageInputRef.current?.click();
                    } else {
                      setAutofillTipPage(1);
                      setShowAutofillTip(true);
                    }
                  }}
                >
                  <Camera className="mr-2 h-5 w-5" />
                  {extracting ? t("common.extracting") : t("form.buttons.autofill")}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleExtractFromImage}
                />
              </>
            )}

            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="date" className="text-xs sm:text-sm">{t("form.date")}</Label>
                <Input
                  id="date"
                  type="date"
                  value={job_date}
                  onChange={(e) => { setJobDate(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  className="h-9 sm:h-10"
                />
              </div>

              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="ot" className="text-xs sm:text-sm"><span className="sm:hidden">{t("common.otLabel")}</span><span className="hidden sm:inline">{t("form.ot")}</span></Label>
                <Input
                  id="ot"
                  value={ot}
                  onChange={(e) => { setOt(e.target.value); setDirty(true); }}
                  placeholder={t("form.otPlaceholder")}
                  disabled={disableInputs}
                  className="h-9 sm:h-10"
                />
              </div>

              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="depart" className="text-xs sm:text-sm">{officeEmployee ? t("form.debut") : t("form.depart")}</Label>
                <Input
                  id="depart"
                  type="time"
                  value={depart}
                  onChange={(e) => { setDepart(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  className="h-9 sm:h-10"
                />
              </div>

              {!officeEmployee && (
              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="arrivee" className="text-xs sm:text-sm">{t("form.arrival")}</Label>
                <Input
                  id="arrivee"
                  type="time"
                  value={arrivee}
                  onChange={(e) => { setArrivee(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  className="h-9 sm:h-10"
                />
              </div>
              )}

              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="fin" className="text-xs sm:text-sm">{t("form.end")}</Label>
                <Input
                  id="fin"
                  type="time"
                  value={fin}
                  onChange={(e) => { setFin(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  className="h-9 sm:h-10"
                />
              </div>

              {!officeEmployee && (
              <div className="grid gap-1 sm:gap-1.5">
                <Label htmlFor="km" className="text-xs sm:text-sm"><span className="sm:hidden">{t("history.km")}</span><span className="hidden sm:inline">{t("form.kmTotal")}</span></Label>
                <Input
                  id="km"
                  type="number"
                  value={km_aller}
                  onChange={(e) => { setKmAller(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  placeholder="0"
                  className="h-9 sm:h-10"
                />
              </div>
              )}

            </div>

            <div className="flex flex-wrap items-end gap-2 sm:gap-4">
              <div className="grid min-w-[8rem] flex-1 gap-1 sm:gap-1.5">
                <Label className="text-xs sm:text-sm">{t("form.totalHours")}</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-bold sm:h-10">
                  {hoursLabel}
                </div>
              </div>

              {parkingReceiptsEnabled && (
                <label className="flex h-9 min-w-[9rem] flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 sm:h-10">
                  <span className="text-sm font-medium">{t("form.parking.title")}</span>
                  <input
                    type="checkbox"
                    checked={parkingRequested}
                    disabled={disableInputs || hasParkingReceipt}
                    onChange={(event) => {
                      if (event.target.checked) { setParkingRequested(true); setDirty(true); }
                      else { setParkingRequested(false); setParkingFile(null); setDirty(true); }
                    }}
                    className="h-5 w-5 rounded border-input accent-primary"
                  />
                </label>
              )}
            </div>

            {parkingReceiptsEnabled && parkingRequested && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  {parkingFile?.name || (hasParkingReceipt ? t("form.parking.receiptSaved") : t("form.parking.description"))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
                  <div className="grid gap-1.5">
                    <Label htmlFor="parking-amount">{t("form.parking.amount")}</Label>
                    <Input id="parking-amount" type="number" inputMode="decimal" min="0.01" max="20" step="0.01" value={parkingAmount} disabled={disableInputs || hasParkingReceipt} onChange={(event) => { setParkingAmount(event.target.value); setDirty(true); }} placeholder="0.00" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`w-fit ${normalizeNumber(parkingAmount) > 0 && !parkingFile && !hasParkingReceipt ? "border-destructive text-destructive ring-1 ring-destructive/40 hover:border-destructive hover:text-destructive" : ""}`}
                      disabled={disableInputs}
                      onClick={() => parkingInputRef.current?.click()}
                    >
                      {parkingFile || hasParkingReceipt ? t("form.parking.replaceReceipt") : t("form.parking.chooseReceipt")}
                    </Button>
                    {hasParkingReceipt && (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-success" title={t("form.parking.receiptSaved")}>
                        <CircleCheck className="h-5 w-5" aria-hidden="true" />
                        <span className="sr-only">{t("form.parking.receiptSaved")}</span>
                      </span>
                    )}
                  </div>
                </div>
                <input ref={parkingInputRef} type="file" accept="image/*" className="hidden" onChange={handleParkingReceipt} />
              </div>
            )}

            <div className="space-y-2 pt-3">
              {(dirty || editId) && !locked && (
                <>
                  <Button type="button" className="h-12 w-full text-base font-semibold" disabled={disableInputs || !formComplete || workOrderBlocked} onClick={saveDraft}>
                    {saving ? t("common.saving") : t("form.buttons.save")}
                  </Button>
                  {!formComplete && (
                    <p className="text-center text-xs font-medium text-warning" role="status">
                      {t("form.missing.hint", { fields: missingFields.join(", ") })}
                    </p>
                  )}
                  {workOrderBlocked && (
                    <button type="button" className="block w-full text-center text-xs font-medium text-destructive underline-offset-2 hover:underline" role="status" onClick={() => setShowWorkOrderCheck(true)}>
                      {t("form.workOrderCheck.blocked")}
                    </button>
                  )}
                </>
              )}

              {editId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => navigate("/form")}
                  disabled={loadingEdit || saving}
                >
                  {t("form.buttons.newJob")}
                </Button>
              )}
            </div>

            {locked && (
              <div className="text-xs text-muted-foreground">
                {t("form.lockedNotice", {
                  status: t(`status.${statusLabel}`),
                  saved: t("status.saved"),
                  updated: t("status.updated"),
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={showAutofillTip} onOpenChange={(open) => {
        setShowAutofillTip(open);
        if (!open) setAutofillTipPage(1);
      }}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>
              {autofillTipPage === 1
                ? t("form.autofillTip.title")
                : t("form.autofillTip.exampleTitle")}
            </DialogTitle>
            <p className="text-xs font-medium text-muted-foreground">
              {t("form.autofillTip.page", { current: autofillTipPage, total: 2 })}
            </p>
          </DialogHeader>

          {autofillTipPage === 1 ? (
            <>
              <div className="px-5 space-y-3 text-sm text-muted-foreground">
                <p><span className="font-semibold text-foreground">1.</span> {t("form.autofillTip.step1")}</p>
                <p><span className="font-semibold text-foreground">2.</span> {t("form.autofillTip.step2")}</p>
                <p><span className="font-semibold text-foreground">3.</span> {t("form.autofillTip.step3")}</p>
              </div>
              <DialogFooter className="px-5 pb-5 pt-3">
                <Button className="w-full" onClick={() => setAutofillTipPage(2)}>
                  {t("form.autofillTip.next")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="px-5 pb-2">
                <div className="mb-3 text-sm text-muted-foreground">
                  <p>{t("form.autofillTip.exampleDescription")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>{t("form.autofillTip.exampleItem1")}</li>
                    <li>{t("form.autofillTip.exampleItem2")}</li>
                    <li>{t("form.autofillTip.exampleItem3")}</li>
                  </ul>
                </div>
                <img
                  src="/Auto-fill.webp"
                  alt={t("form.autofillTip.exampleAlt")}
                  className="mx-auto w-full rounded-md border object-contain"
                  style={{ maxHeight: "60vh" }}
                />
              </div>
              <DialogFooter className="gap-2 px-5 pb-5 pt-2 sm:flex-col sm:space-x-0">
                <Button
                  className="w-full"
                  onClick={() => {
                    setShowAutofillTip(false);
                    imageInputRef.current?.click();
                  }}
                >
                  {t("form.autofillTip.choose")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    localStorage.setItem("autofill_tip_seen", "1");
                    setShowAutofillTip(false);
                    imageInputRef.current?.click();
                  }}
                >
                  {t("form.autofillTip.dontShowAgain")}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setAutofillTipPage(1)}>
                  {t("common.back")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={returnStep !== "closed"} onOpenChange={(open) => {
        if (!open && !saving && !daySubmitBusy && !inventoryBusySlot) closeReturnDialog();
      }}>
        <DialogContent className="max-w-md">
          {returnSaveError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {returnSaveError}
              {pendingResend && <p className="mt-1 text-xs text-info">{t("form.autoResend.pending", { attempt: pendingResend.attempt + 1, max: AUTO_RESEND_DELAYS_S.length })}</p>}
            </div>
          )}
          {returnStep === "last" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.last.title")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.last.description")}</p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" disabled={saving || returnCheckBusy} onClick={() => answerLastJob(false)}>
                  {returnCheckBusy ? t("common.pleaseWait") : t("common.no")}
                </Button>
                <Button type="button" disabled={saving || returnCheckBusy} onClick={() => answerLastJob(true)}>
                  {t("common.yes")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "ask" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.return.askTitle")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.return.askDescription")}</p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" disabled={saving || returnCheckBusy} onClick={() => saveWithReturn(0, 0, "draft")}>
                  {returnCheckBusy ? t("common.pleaseWait") : t("common.no")}
                </Button>
                <Button type="button" disabled={saving || returnCheckBusy} onClick={() => setReturnStep("time")}>
                  {t("common.yes")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "time" && (
            <>
              <DialogHeader><DialogTitle>{t("form.return.timeTitle")}</DialogTitle></DialogHeader>
              <div className="grid max-h-[55vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
                {RETURN_TIME_OPTIONS.map((minutes) => (
                  <Button key={minutes} type="button" variant={returnMinutes === minutes ? "default" : "outline"} className="px-2" onClick={() => {
                    setReturnMinutes(minutes);
                    setReturnStep("km");
                  }}>
                    {formatReturnMinutes(minutes)}
                  </Button>
                ))}
              </div>
            </>
          )}

          {returnStep === "km" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.return.kmTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="return-km">{t("form.return.kmLabel")}</Label>
                <Input
                  id="return-km"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={returnKm}
                  onChange={(event) => setReturnKm(event.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">{t("form.return.selectedTime", { time: formatReturnMinutes(returnMinutes || 0) })}</p>
                {normalizeNumber(returnKm) !== null && normalizeNumber(returnKm) >= 0 && normalizeNumber(returnKm) <= (normalizeNumber(km_aller) || 0) && (
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("form.return.kmBreakdown", { client: Math.max(0, (normalizeNumber(km_aller) || 0) - normalizeNumber(returnKm)), returnKm: normalizeNumber(returnKm), total: normalizeNumber(km_aller) || 0 })}
                  </p>
                )}
                {normalizeNumber(returnKm) !== null && normalizeNumber(returnKm) > (normalizeNumber(km_aller) || 0) && (
                  <p className="text-xs font-medium text-destructive">
                    {t("form.return.kmExceedsTotal")} ({t("form.return.kmBreakdown", { client: 0, returnKm: normalizeNumber(returnKm), total: normalizeNumber(km_aller) || 0 })})
                  </p>
                )}
                {normalizeNumber(returnKm) !== null && normalizeNumber(returnKm) < 0 && (
                  <p className="text-xs font-medium text-destructive">{t("form.return.kmNegative")}</p>
                )}
                {returnSaveError && <p className="text-xs font-medium text-destructive">{returnSaveError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" disabled={saving || returnCheckBusy || normalizeNumber(returnKm) === null || normalizeNumber(returnKm) < 0 || normalizeNumber(returnKm) > (normalizeNumber(km_aller) || 0)} onClick={() => saveWithReturn(returnMinutes, normalizeNumber(returnKm))}>
                  {saving || returnCheckBusy ? t("common.saving") : t("form.buttons.save")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "evidence" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.evidence.title")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  {t("form.evidence.description")}
                </div>
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="font-semibold">{t("form.evidence.requiredContentTitle")}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>{t("form.evidence.requiredApproval")}</li>
                    <li>{t("form.evidence.requiredDuration")}</li>
                    <li>{t("form.evidence.requiredCrop")}</li>
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    aria-expanded={showOvertimeExample}
                    aria-controls="overtime-evidence-example"
                    onClick={() => setShowOvertimeExample((visible) => !visible)}
                  >
                    {showOvertimeExample ? t("form.evidence.hideExample") : t("form.evidence.showExample")}
                  </Button>
                  {showOvertimeExample && (
                    <div id="overtime-evidence-example" className="mt-3 rounded-md border bg-background p-2">
                      <img
                        src="/overtime-evidence-example.webp"
                        alt={t("form.evidence.exampleAlt")}
                        className="max-h-96 w-full rounded object-contain"
                      />
                    </div>
                  )}
                </div>
                {evidenceValidationError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{evidenceValidationError}</div>}
                {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{err}</div>}
                <input
                  ref={overtimeInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleOvertimeEvidence}
                />
              </div>
              <DialogFooter>
                {failedEvidenceFile && !evidenceBusy && (
                  <Button type="button" variant="outline" onClick={() => processEvidenceFile(failedEvidenceFile)}>
                    {t("form.evidence.retry")}
                  </Button>
                )}
                <Button type="button" disabled={evidenceBusy} onClick={() => overtimeInputRef.current?.click()}>
                  {evidenceBusy ? t("form.evidence.processing") : t("form.evidence.choose")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "inventory" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.inventory.title")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{t("form.inventory.description")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={showInventoryExamples}
                  onClick={() => setShowInventoryExamples((visible) => !visible)}
                >
                  {showInventoryExamples ? t("form.inventory.hideExample") : t("form.inventory.showExample")}
                </Button>
                {showInventoryExamples && (
                  <div className="grid grid-cols-3 gap-2 rounded-md border bg-background p-2">
                    {INVENTORY_SLOTS.map((slot) => (
                      <img key={slot} src={`/inventory-examples/${slot}.webp`} alt={t("form.inventory.exampleAlt", { n: slot })} className="max-h-72 w-full rounded object-contain" />
                    ))}
                  </div>
                )}
                <ul className="space-y-2">
                  {INVENTORY_SLOTS.map((slot) => {
                    const done = inventoryRows.some((row) => row.slot === slot);
                    const busy = inventoryBusySlot === slot;
                    return (
                      <li key={slot} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <span className="flex items-center gap-2 font-medium">
                          {done && <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />}
                          {t("form.inventory.slot", { n: slot })}
                        </span>
                        <Button type="button" size="sm" variant={done ? "outline" : "default"} disabled={Boolean(inventoryBusySlot)} onClick={() => pickInventorySlot(slot)}>
                          {busy ? t("form.inventory.uploading") : done ? t("form.inventory.replace") : t("form.inventory.capture")}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {inventoryError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive" role="alert">{inventoryError}</div>}
                <input ref={inventoryInputRef} type="file" accept="image/*" className="hidden" onChange={handleInventoryFile} />
              </div>
              <DialogFooter>
                <Button type="button" disabled={Boolean(inventoryBusySlot) || missingInventorySlots(inventoryRows).length > 0} onClick={() => setReturnStep("dayDone")}>
                  {t("form.inventory.continue")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "dayDone" && (
            <>
              <DialogHeader><DialogTitle>{t("form.day.readyTitle")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t(!officeEmployee && inventoryEnabled ? "form.day.readyDescription" : "form.day.readyDescriptionPlain")}</p>
              {daySubmitError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{daySubmitError}</div>}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" disabled={daySubmitBusy} onClick={() => { closeReturnDialog(); navigate("/history"); }}>
                  {t("form.day.review")}
                </Button>
                <Button type="button" variant="success" disabled={daySubmitBusy} onClick={submitEndOfDay}>
                  {daySubmitBusy ? t("common.submitting") : t("form.day.submit")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "daySubmitted" && (
            <>
              <DialogHeader><DialogTitle>{t("form.day.submittedTitle")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.day.submittedDescription")}</p>
              <DialogFooter>
                <Button type="button" onClick={closeReturnDialog}>{t("common.ok")}</Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "success" && (
            <>
              <DialogHeader><DialogTitle>{t("form.return.savedTitle")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.return.savedDescription")}</p>
              <DialogFooter>
                <Button type="button" onClick={closeReturnDialog}>{t("common.ok")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showWorkOrderCheck && workOrderProblems.length > 0} onOpenChange={setShowWorkOrderCheck}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <TriangleAlert className="h-5 w-5" />{t("form.workOrderCheck.title")}
            </DialogTitle>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {workOrderProblems.map((issue) => (
              <li key={issue.code}>{t(`form.workOrderCheck.${issue.code}`, { miles: String(issue.miles ?? "").replace(".", ","), km: issue.km ?? "" })}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("form.workOrderCheck.body")}</p>
          <DialogFooter>
            <Button type="button" onClick={() => setShowWorkOrderCheck(false)}>{t("common.ok")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </AppShell>
  );
}
