import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { Camera } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status";
import { isAdminEmployee, isManagerRole } from "@/lib/roles";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useT } from "@/lib/use-t";
import { withRetry, withTimeout } from "@/lib/utils";
import { buildJobSaveRpcArgs, buildJobSaveWithEvidenceRpcArgs, kilometreFieldValue, requiresEvidenceBeforeSave } from "@/lib/job-submission";
import { validateJobSubmissionContract } from "@/lib/job-contract";
import { COMPANY_TIME_ZONE, companyDate } from "@/lib/company-time";
import { deleteDraft, loadDraft, saveDraft as persistDraft } from "@/lib/draft-store";
import { evidenceUploadFailure, isFileFailure, prepareEvidenceImage, readPickedFile } from "@/lib/evidence-file";
import { reportFileReadError } from "@/lib/file-read-report";
import { friendlyErrorMessage, isOfflineError } from "@/lib/error-messages";
import { classifyApiError } from "@/lib/api-errors";
import { submitSavedJob } from "@/lib/submit-job";
import { extractWorkOrderText, parseExtractedText, workOrderIssues } from "@/lib/work-order-ocr";
import { ENTRY_SOURCES, recordEntrySource } from "@/lib/entry-source";
import { isPendingManagerEntry } from "@/lib/manager-entry";
import { MAX_PARKING_PICTURES, parkingReceiptPaths } from "@/lib/parking-receipts";
import { uploadParkingReceipt as uploadParkingReceiptFiles } from "@/lib/parking-upload";
import { createMealClaim as createMealClaimFor, shouldRequestMealClaim as shouldRequestMealClaimFor } from "@/lib/meal-claim-request";
import { overtimeEvidenceNeeded, uploadOvertimeEvidence } from "@/lib/overtime-evidence-check";
import { AUTO_RESEND_DELAYS_S, fmtTimeHHmm, isEditableStatus, makeDayjsFromJob, normalizeNumber, toHHmmLabelFromFormatHours } from "@/lib/employee-form-helpers";
import { isJobOverlapError, jobOverlapDetails, jobOverlapMessage } from "@/lib/job-overlap";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { useInventoryStep } from "@/components/employee-form/use-inventory-step";
import FormMessages from "@/components/employee-form/FormMessages";
import JobEntryFields from "@/components/employee-form/JobEntryFields";
import ParkingReceiptFields from "@/components/employee-form/ParkingReceiptFields";
import AutofillTipDialog from "@/components/employee-form/AutofillTipDialog";
import EndOfShiftDialog from "@/components/employee-form/EndOfShiftDialog";
import WorkOrderCheckDialog from "@/components/employee-form/WorkOrderCheckDialog";
import ManualEntryCheckDialog from "@/components/employee-form/ManualEntryCheckDialog";

dayjs.locale("en");


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
  // Night of the fall time change (0116): the manager's choice of the repeated hour on this job, kept so the
  // check before submitting resolves the same instant as the database. Only a manager sets it.
  const dstFoldsRef = useRef({ depart_fold: null, fin_fold: null });
  const [km_aller, setKmAller] = useState("");

  // dirty = the form has unsaved changes. Reset on load/save, set on edit.
  const [dirty, setDirty] = useState(false);

  const [locked, setLocked] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const imageInputRef = useRef(null);
  const overtimeInputRef = useRef(null);
  const parkingInputRef = useRef(null);
  const parkingModeRef = useRef("replace");
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
  // Raw text of the last screenshot read, shown on demand in the check dialog so a misread can be
  // reported exactly (kept in memory only, never saved).
  const [lastOcrText, setLastOcrText] = useState("");
  // A new field entry typed by hand (no Field Service screenshot read): Save first reminds the
  // employee that the screenshot is better and that Field Service must match the entry.
  const [fromScreenshot, setFromScreenshot] = useState(false);
  const [showManualEntryCheck, setShowManualEntryCheck] = useState(false);
  const [returnStep, setReturnStep] = useState("closed");
  const [returnMinutes, setReturnMinutes] = useState(null);
  const [returnKm, setReturnKm] = useState("");
  const [pendingReturn, setPendingReturn] = useState(null);
  const [pendingEvidenceJobId, setPendingEvidenceJobId] = useState(null);
  const pendingEvidence = useRef(null); // { jobId, evidenceId } of a proof committed before a later step failed
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [failedEvidenceFile, setFailedEvidenceFile] = useState(null); // kept so "Réessayer" needs no re-pick
  const [evidenceValidationError, setEvidenceValidationError] = useState("");
  const [returnSaveError, setReturnSaveError] = useState("");
  const [returnCheckBusy, setReturnCheckBusy] = useState(false);
  const [overtimeDailyMinutes, setOvertimeDailyMinutes] = useState(0);
  const [hasOvertimeEvidence, setHasOvertimeEvidence] = useState(false);
  const [parkingRequested, setParkingRequested] = useState(false);
  // Parcomètre pictures picked but not saved yet (several at once, migration 0095), and whether they
  // are added to the saved ones or replace them.
  const [parkingFiles, setParkingFiles] = useState([]);
  const [parkingFilesMode, setParkingFilesMode] = useState("add");
  const [parkingSaved, setParkingSaved] = useState({ count: 0, status: "pending" });
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
  const daySubmitRef = useRef(false);
  const inventory = useInventoryStep({ userId: user?.id, dayRef: endShiftDateRef, open: returnStep === "inventory", t });
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
    setFromScreenshot(Boolean(draft.fromScreenshot));
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
      dstFoldsRef.current = { depart_fold: data.depart_fold ?? null, fin_fold: data.fin_fold ?? null };
      setHasOvertimeEvidence(Boolean(data.overtime_evidence_captured));
      loadedReturnRef.current = {
        minutes: Number(data.return_time_minutes) || 0,
        km: Number(data.km_retour) || 0,
      };
      setParkingRequested(Boolean(data.parking_receipt_captured));
      setHasParkingReceipt(Boolean(data.parking_receipt_captured));
      setParkingFiles([]);

      setKmAller(kilometreFieldValue(data));
      if (data.parking_receipt_captured) {
        const { data: parkingReceipt } = await withTimeout(
          supabase.from("parking_receipts").select("amount, status, storage_path, extra_storage_paths").eq("job_id", data.id).maybeSingle(),
          10000
        );
        setParkingAmount(parkingReceipt?.amount == null ? "" : String(parkingReceipt.amount));
        setParkingSaved({ count: parkingReceiptPaths(parkingReceipt).length, status: parkingReceipt?.status || "pending" });
      } else {
        setParkingAmount("");
        setParkingSaved({ count: 0, status: "pending" });
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
    dstFoldsRef.current = { depart_fold: null, fin_fold: null };
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
    setParkingFiles([]);
    setParkingFilesMode("add");
    setParkingSaved({ count: 0, status: "pending" });
    setParkingAmount("");
    setWorkOrderProblems([]);
    setShowWorkOrderCheck(false);
    setFromScreenshot(false);
    setShowManualEntryCheck(false);
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
          returnMinutes, returnKm, parkingRequested, parkingAmount, pendingSaveMode, workOrderProblems, fromScreenshot,
        },
      }).catch((error) => console.warn("[draft] local save failed", error));
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [draftReady, dirty, effectiveUserId, editId, isViewMode, locked, job_date, ot, depart, arrivee, fin, km_aller, returnMinutes, returnKm, parkingRequested, parkingAmount, pendingSaveMode, workOrderProblems, fromScreenshot]);

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
        setParkingFiles([]);
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
    if (!editId && !officeEmployee && !fromScreenshot) { setShowManualEntryCheck(true); return; }
    startSaveFlow();
  }

  function startSaveFlow() {
    setShowManualEntryCheck(false);
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
    if (parkingRequested && parkingFiles.length === 0 && !hasParkingReceipt) {
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
          ...(editId ? dstFoldsRef.current : {}),
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
      // New field entry: remember whether it came from the Field Service screenshot or was typed
      // by hand (red star for managers). Best effort, never delays or fails the save.
      if (!editId && !officeEmployee) {
        recordEntrySource(supabase, { jobId: savedJobId, userId: user.id, source: fromScreenshot ? ENTRY_SOURCES.screenshot : ENTRY_SOURCES.manual });
      }
      setInfo(editId
        ? (nextStatus === "submitted" ? "form.toasts.submitted" : "form.toasts.updated")
        : (nextStatus === "submitted" ? "form.toasts.savedAndSubmitted" : "form.toasts.saved"));
      setStatus(data.status || nextStatus);
      setLocked(Boolean(data.locked));
      setDirty(false);
      setWarning(overlapWarning || "");

      if (!editId && !returnValues) navigate(`/form?edit=${savedJobId}`, { replace: true });
      if (parkingRequested && parkingFiles.length > 0) {
        const count = await uploadParkingReceipt(savedJobId, parkingFiles, parkingAmountNumber, parkingFilesMode);
        setHasParkingReceipt(true);
        setParkingSaved({ count, status: "pending" });
        setParkingFiles([]);
        setParkingFilesMode("add");
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
      } else if (isFileFailure(e)) {
        // A parking receipt the phone could not read: say why instead of « save failed ».
        lastSaveErrorRef.current = `${t("form.parking.fileFailed")} ${t(`form.evidence.reason.${evidenceUploadFailure(e).key}`)}`;
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

  // Every picked parcomètre picture, then the ONE claim row of the job (src/lib/parking-upload.js).
  function uploadParkingReceipt(jobId, files, amount, mode = "add") {
    return uploadParkingReceiptFiles(supabase, {
      userId: user.id, jobId, jobDate: job_date, files, amount, mode,
      tooManyMessage: t("form.parking.tooMany", { max: MAX_PARKING_PICTURES }),
    });
  }

  function handleParkingReceipt(event, mode) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (files.length === 0) {
      if (!hasParkingReceipt) setParkingRequested(false);
      return;
    }
    const total = (mode === "add" ? parkingSaved.count : 0) + files.length;
    if (total > MAX_PARKING_PICTURES) {
      setErr(t("form.parking.tooMany", { max: MAX_PARKING_PICTURES }));
      return;
    }
    setErr("");
    setParkingFiles(files);
    setParkingFilesMode(mode);
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
      setParkingFiles([]);
      setParkingFilesMode("add");
      setParkingSaved({ count: 0, status: "pending" });
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
    setDaySubmitError("");
    if (officeEmployee || !inventoryEnabled) {
      setReturnStep("dayDone");
      return;
    }
    // The step stays open until every list slot and the defective-products question are done.
    setReturnStep(await inventory.start() ? "inventory" : "dayDone");
  }

  function closeReturnDialog() {
    endShiftRef.current = false;
    endShiftDateRef.current = null;
    setReturnStep("closed");
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
    try {
      const { needed, paidDayMinutes } = await overtimeEvidenceNeeded(supabase, {
        userId: user.id, jobDate: job_date, editId, hasOvertimeEvidence, firstTripUnpaid,
        // Known locally without any network call.
        thisMinutes: Math.round(hoursDecimal * 60),
        current: { depart, arrivee, fin },
      });
      if (paidDayMinutes != null) setOvertimeDailyMinutes(paidDayMinutes);
      return needed;
    } catch (error) {
      // Submission must fail closed: without the other jobs we cannot prove that
      // the complete day is at or below 8 h.
      console.error("[overtime evidence] day-jobs check failed; submission blocked", error);
      throw error;
    }
  }

  // Supper claim of the day (src/lib/meal-claim-request.js). Office staff are non-CCQ: never.
  async function shouldRequestMealClaim(jobId) {
    if (officeEmployee) return false;
    return shouldRequestMealClaimFor(supabase, { userId: user.id, jobDate: job_date, jobId });
  }

  async function createMealClaim(jobId) {
    try {
      await createMealClaimFor(supabase, { userId: user.id, jobId, jobDate: job_date, dailyMinutes: overtimeDailyMinutes });
      return true;
    } catch (error) {
      setErr(isOfflineError(error) ? "" : friendlyErrorMessage(error, t, "form.meal.failed"));
      return false;
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
    // In-memory copy of the picked screenshot: « Réessayer » reuses it instead of reading the phone's
    // file again. It stays null when the phone refused to read the file (no retry button then).
    let source = null;
    try {
      let savedJobId = committed?.jobId || null;
      if (!committed) {
        try {
          source = file instanceof File ? await readPickedFile(file) : file;
          const image = await prepareEvidenceImage(source);
          await uploadOvertimeEvidence(supabase, storagePath, image);
          evidenceUploaded = true;
        } catch (error) {
          console.error("[overtime evidence] Screenshot upload failed", error);
          if (isFileFailure(error)) reportFileReadError("overtime", file, error);
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
      } else if (parkingRequested && parkingFiles.length > 0) {
        try {
          const count = await uploadParkingReceipt(savedJobId, parkingFiles, normalizeNumber(parkingAmount), parkingFilesMode);
          setHasParkingReceipt(true);
          setParkingSaved({ count, status: "pending" });
          setParkingFiles([]);
          setParkingFilesMode("add");
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
      // A proof already committed retries without a file; otherwise only a picture the app could read.
      setFailedEvidenceFile(committed ? file : source);
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
      setLastOcrText(String(text || ""));

      if (d.job_date) setJobDate(String(d.job_date));
      if (d.ot) setOt(String(d.ot));
      if (d.depart) setDepart(String(d.depart));
      if (d.arrivee) setArrivee(String(d.arrivee));
      if (d.fin) setFin(String(d.fin));
      if (d.km_aller !== null && d.km_aller !== undefined) setKmAller(String(d.km_aller));
      // A required value missing or empty on the screenshot (likely empty in Field Service too),
      // or Miles Traveled ≠ Distance réelle parcourue: tell the employee to fix the work order.
      // Blocks Save until a new screenshot shows a complete work order.
      setFromScreenshot(true);
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
  const parkingComplete = !parkingRequested || (normalizeNumber(parkingAmount) > 0 && (parkingFiles.length > 0 || hasParkingReceipt));
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

  // Autofill: the tip comes first until the employee asks not to see it again.
  const openAutofill = () => {
    if (localStorage.getItem("autofill_tip_seen")) {
      imageInputRef.current?.click();
    } else {
      setAutofillTipPage(1);
      setShowAutofillTip(true);
    }
  };
  const entryValues = { job_date, ot, depart, arrivee, fin, km_aller };
  const entrySetters = { job_date: setJobDate, ot: setOt, depart: setDepart, arrivee: setArrivee, fin: setFin, km_aller: setKmAller };
  const changeEntry = (field, value) => { entrySetters[field](value); setDirty(true); };

  return (
    <AppShell>
      <div className="space-y-2 sm:space-y-3">
        <FormMessages
          t={t}
          err={err}
          canRetryLoad={Boolean(editId && editLoadFailed)}
          retryDisabled={loadingEdit}
          onRetryLoad={loadEdit}
          pendingResend={pendingResend}
          managerEntryBy={managerEntryBy}
          info={info}
          draftRestored={draftRestored}
          onDiscardDraft={discardLocalDraft}
          warning={warning}
          entryBlockedReason={entryBlockedReason}
          canReturnToToday={Boolean(editId || job_date !== companyDate())}
          returnDisabled={saving}
          onReturnToToday={returnToTodaysJobCard}
        />

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
                  onClick={openAutofill}
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

            <JobEntryFields
              t={t}
              values={entryValues}
              onChange={changeEntry}
              disabled={disableInputs}
              officeEmployee={officeEmployee}
              hoursLabel={hoursLabel}
              parking={{
                enabled: parkingReceiptsEnabled,
                requested: parkingRequested,
                hasReceipt: hasParkingReceipt,
                onRequested: (checked) => {
                  setParkingRequested(checked);
                  if (!checked) setParkingFiles([]);
                  setDirty(true);
                },
              }}
            />

            {parkingReceiptsEnabled && parkingRequested && (
              <ParkingReceiptFields
                t={t}
                disabled={disableInputs}
                amount={parkingAmount}
                onAmount={(value) => { setParkingAmount(value); setDirty(true); }}
                files={parkingFiles}
                filesMode={parkingFilesMode}
                saved={parkingSaved}
                hasReceipt={hasParkingReceipt}
                inputRef={parkingInputRef}
                modeRef={parkingModeRef}
                onPick={handleParkingReceipt}
                onCancelPicked={() => { setParkingFiles([]); setParkingFilesMode("add"); }}
              />
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
      <AutofillTipDialog
        t={t}
        open={showAutofillTip}
        page={autofillTipPage}
        onPage={setAutofillTipPage}
        onOpenChange={(open) => {
          setShowAutofillTip(open);
          if (!open) setAutofillTipPage(1);
        }}
        onChoose={(remember) => {
          if (remember) localStorage.setItem("autofill_tip_seen", "1");
          setShowAutofillTip(false);
          imageInputRef.current?.click();
        }}
      />
      <EndOfShiftDialog
        t={t}
        step={returnStep}
        onStep={setReturnStep}
        busy={saving || daySubmitBusy || Boolean(inventory.busySlot)}
        onClose={closeReturnDialog}
        saveError={returnSaveError}
        pendingResend={pendingResend}
        returnFlow={{
          saving, checking: returnCheckBusy, answerLastJob, saveWithReturn,
          minutes: returnMinutes, setMinutes: setReturnMinutes, km: returnKm, setKm: setReturnKm, kmTotal: km_aller,
        }}
        evidence={{
          inputRef: overtimeInputRef,
          onFile: handleOvertimeEvidence,
          validationError: evidenceValidationError,
          error: err,
          canRetry: Boolean(failedEvidenceFile),
          onRetry: () => processEvidenceFile(failedEvidenceFile),
          busy: evidenceBusy,
        }}
        inventory={inventory}
        day={{
          withInventory: !officeEmployee && inventoryEnabled,
          error: daySubmitError,
          busy: daySubmitBusy,
          onReview: () => { closeReturnDialog(); navigate("/history"); },
          onSubmit: submitEndOfDay,
        }}
      />

      <WorkOrderCheckDialog
        t={t}
        open={showWorkOrderCheck && workOrderProblems.length > 0}
        onOpenChange={setShowWorkOrderCheck}
        problems={workOrderProblems}
        ocrText={lastOcrText}
      />
      <ManualEntryCheckDialog
        t={t}
        open={showManualEntryCheck}
        onOpenChange={setShowManualEntryCheck}
        onUseScreenshot={() => { setShowManualEntryCheck(false); imageInputRef.current?.click(); }}
        onContinue={startSaveFlow}
      />
      {confirmDialog}
    </AppShell>
  );
}
