import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
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
import { useT } from "@/lib/use-t";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

dayjs.locale("en");

function parseExtractedText(text) {
  const out = {};

  const ot = text.match(/OT[\s\-_:]*(\d{4,8})/i);
  if (ot) out.ot = ot[1];

  const dates = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (dates.length) {
    const [, dd, mm, yyyy] = dates[0];
    out.job_date = `${yyyy}-${mm}-${dd}`;
  }

  const labelTime = (labelRegex) => {
    const m = text.match(labelRegex);
    if (!m) return null;
    const tail = text.slice(m.index, m.index + 200);
    const t = tail.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
    return t ? `${String(t[1]).padStart(2, "0")}:${t[2]}` : null;
  };

  const depart = labelTime(/Heure\s+de\s+d[eé]but/i);
  if (depart) out.depart = depart;

  const fin = labelTime(/Heure\s+de\s+fin/i);
  if (fin) out.fin = fin;

  const arrivee = labelTime(/Heure\s+d['’]?\s*arriv[eé]e/i);
  if (arrivee) out.arrivee = arrivee;

  const km = text.match(/Distance\s+parcourue[^0-9]*?(\d+(?:[.,]\d+)?)/i);
  if (km) out.km_aller = Math.round(parseFloat(km[1].replace(",", ".")));

  return out;
}

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

const RETURN_TIME_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);

function formatReturnMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} h`;
  return `${hours} h ${remainder}`;
}

function validateOvertimeSmsText(text) {
  const normalized = String(text || "").toLocaleLowerCase("fr-CA");
  const mentionsOvertime = /temps\s+suppl[eé]mentaire|\bts\b/.test(normalized);
  const confirmsApproval = /approuv[eé]e?|autoris[eé]e?|accord[eé]e?/.test(normalized);
  const includesDuration = /\b\d+(?:[.,]\d+)?\s*(?:h(?:eure)?s?|min(?:ute)?s?)\b/.test(normalized);
  return mentionsOvertime && confirmsApproval && includesDuration;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Please retry.`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export default function EmployeeForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = useT();

  const editId = searchParams.get("edit");

  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [job_date, setJobDate] = useState(dayjs().format("YYYY-MM-DD"));
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
  const [showAutofillTip, setShowAutofillTip] = useState(false);
  const [autofillTipPage, setAutofillTipPage] = useState(1);
  const [returnStep, setReturnStep] = useState("closed");
  const [returnMinutes, setReturnMinutes] = useState(null);
  const [returnKm, setReturnKm] = useState("");
  const [pendingReturn, setPendingReturn] = useState(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceValidationError, setEvidenceValidationError] = useState("");
  const [showOvertimeExample, setShowOvertimeExample] = useState(false);
  const [returnSaveError, setReturnSaveError] = useState("");
  const [returnCheckBusy, setReturnCheckBusy] = useState(false);
  const [overtimeDailyMinutes, setOvertimeDailyMinutes] = useState(0);
  const [hasOvertimeEvidence, setHasOvertimeEvidence] = useState(false);
  const [parkingRequested, setParkingRequested] = useState(false);
  const [parkingFile, setParkingFile] = useState(null);
  const [hasParkingReceipt, setHasParkingReceipt] = useState(false);
  const [parkingReceiptsEnabled, setParkingReceiptsEnabled] = useState(false);
  const [pendingSaveMode, setPendingSaveMode] = useState("draft");

  const [status, setStatus] = useState("");
  const statusLabel = editId ? (status || "saved") : "new";

  const departDj = useMemo(() => makeDayjsFromJob(job_date, depart), [job_date, depart]);
  const finDj = useMemo(() => makeDayjsFromJob(job_date, fin), [job_date, fin]);
  const hoursDecimal = useMemo(() => hoursBetween(departDj, finDj) || 0, [departDj, finDj]);
  const hoursLabel = useMemo(
    () => toHHmmLabelFromFormatHours(formatHours(hoursDecimal)),
    [hoursDecimal]
  );

  async function loadEdit() {
    if (!editId || !user?.id) return;

    setErr("");
    setInfo("");
    setLoadingEdit(true);

    try {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", editId).single();
      if (error) throw error;
      if (!data) throw new Error(t("form.errors.notFound"));
      if (data.user_id !== user.id) throw new Error(t("form.errors.notAuthorized"));

      setJobDate(data.job_date || dayjs().format("YYYY-MM-DD"));
      setOt(data.ot || "");
      setDepart(fmtTimeHHmm(data.depart) || "");
      setArrivee(fmtTimeHHmm(data.arrivee) || "");
      setFin(fmtTimeHHmm(data.fin) || "");
      setHasOvertimeEvidence(Boolean(data.overtime_evidence_captured));
      setParkingRequested(Boolean(data.parking_receipt_captured));
      setHasParkingReceipt(Boolean(data.parking_receipt_captured));
      setParkingFile(null);

      const aller = data.km_aller ?? "";
      setKmAller(aller === null || aller === undefined ? "" : String(aller));

      const s = (data.status || "saved").trim();
      setStatus(s);

      const shouldLock = Boolean(data.locked) || !isEditableStatus(s);
      setLocked(shouldLock);
      setDirty(false);
    } catch (e) {
      setErr(e?.message || t("form.errors.failedLoad"));
    } finally {
      setLoadingEdit(false);
    }
  }

  useEffect(() => {
    if (editId) {
      loadEdit();
    } else {
      // "New job" — reset form to empty defaults so previous job's data
      // doesn't bleed into the next entry.
      setJobDate(dayjs().format("YYYY-MM-DD"));
      setOt("");
      setDepart("");
      setArrivee("");
      setFin("");
      setKmAller("");
      setStatus("");
      setLocked(false);
      setErr("");
      setInfo("");
      setDirty(false);
      setHasOvertimeEvidence(false);
      setParkingRequested(false);
      setHasParkingReceipt(false);
      setParkingFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("parking_receipts_enabled").eq("id", user.id).single().then(({ data, error }) => {
      if (error) {
        setErr(error.message);
        return;
      }
      const enabled = Boolean(data?.parking_receipts_enabled);
      setParkingReceiptsEnabled(enabled);
      if (!enabled) {
        setParkingRequested(false);
        setParkingFile(null);
      }
    });
  }, [user?.id]);

  async function saveDraft() {
    setPendingSaveMode("draft");
    setReturnMinutes(null);
    setReturnKm("");
    setReturnStep("ask");
  }

  async function submitJob() {
    setPendingSaveMode("submit");
    setReturnMinutes(null);
    setReturnKm("");
    setReturnStep("ask");
  }

  async function saveJob(mode, returnValues = null, forcedId = null, captureEvidence = false) {
    if (!user?.id) {
      setErr(t("form.errors.notSignedIn"));
      return;
    }
    if (saving) return;
    if (parkingRequested && !parkingFile && !hasParkingReceipt) {
      setErr(t("form.parking.receiptRequired"));
      parkingInputRef.current?.click();
      return false;
    }

    setErr("");
    setInfo("");
    setSaving(true);

    try {
      const kmAllerNum = normalizeNumber(km_aller) ?? 0;

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

      const nextLocked = nextStatus === "submitted";

      const payload = {
        user_id: user.id,
        job_date,
        ot,
        depart,
        arrivee,
        fin,
        km_aller: kmAllerNum,
        status: nextStatus,
        locked: nextLocked,
        ...(returnValues ? {
          return_time_minutes: returnValues.minutes,
          km_retour: returnValues.km,
        } : {}),
        ...(captureEvidence ? { overtime_evidence_captured: true } : {}),
        parking_receipt_captured: hasParkingReceipt,
      };

      let savedJobId = editId || forcedId;

      if (editId) {
        const { error } = await withTimeout(
          supabase.from("jobs").update(payload).eq("id", editId),
          15000,
          "Save"
        );
        if (error) throw error;

        setInfo(nextStatus === "submitted" ? t("form.toasts.submitted") : t("form.toasts.updated"));
        setStatus(nextStatus);
        setLocked(nextLocked);
        setDirty(false);
      } else {
        const { data, error } = await withTimeout(
          supabase.from("jobs").insert(forcedId ? { ...payload, id: forcedId } : payload).select("id").single(),
          15000,
          "Save"
        );
        if (error) throw error;
        if (!data?.id) throw new Error(t("form.errors.insertNoId"));
        savedJobId = data.id;

        setInfo(nextStatus === "submitted" ? t("form.toasts.savedAndSubmitted") : t("form.toasts.saved"));
        setStatus(nextStatus);
        setLocked(nextLocked);
        setDirty(false);

        if (!returnValues) navigate(`/form?edit=${data.id}`, { replace: true });
      }
      if (parkingRequested && parkingFile) {
        await uploadParkingReceipt(savedJobId, parkingFile);
        const { error: parkingFlagError } = await supabase.from("jobs").update({ parking_receipt_captured: true }).eq("id", savedJobId);
        if (parkingFlagError) throw parkingFlagError;
        setHasParkingReceipt(true);
        setParkingFile(null);
      }
      return savedJobId;
    } catch (e) {
      // Postgres unique_violation = "23505". Map it to a friendly message
      // since the raw "duplicate key value violates unique constraint…" is
      // useless to an employee.
      const code = e?.code || e?.cause?.code;
      const msg = String(e?.message || "");
      if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        setErr(t("form.errors.duplicateOt", { ot: ot || "" }));
      } else {
        setErr(e?.message || t("form.errors.saveFailed"));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function uploadParkingReceipt(jobId, file) {
    const receiptId = crypto.randomUUID();
    const storagePath = `${user.id}/${job_date}/${receiptId}.jpg`;
    const image = await compressImage(file);
    const { error: uploadError } = await supabase.storage
      .from("parking-receipts")
      .upload(storagePath, image, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;

    const { error: receiptError } = await supabase.from("parking_receipts").upsert({
      job_id: jobId,
      user_id: user.id,
      job_date,
      storage_path: storagePath,
    }, { onConflict: "job_id" });
    if (receiptError) throw receiptError;
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

  async function saveWithReturn(minutes, km) {
    setReturnSaveError("");
    setReturnCheckBusy(true);
    const returnValues = { minutes, km };
    const needsEvidence = await requiresOvertimeEvidence(minutes);
    setReturnCheckBusy(false);
    if (needsEvidence) {
      setPendingReturn(returnValues);
      setReturnStep("evidence");
      return;
    }
    const saved = await saveJob(pendingSaveMode, returnValues);
    if (!saved) {
      setReturnSaveError(t("form.return.saveError"));
      return;
    }

    setReturnStep("success");
    if (editId) {
      navigate("/form", { replace: true });
    } else {
      setJobDate(dayjs().format("YYYY-MM-DD"));
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

  async function requiresOvertimeEvidence(candidateReturnMinutes) {
    try {
      const [{ data: profile }, { data: dayJobs, error: jobsError }] = await withTimeout(
        Promise.all([
          supabase.from("profiles").select("include_return_time_in_overtime").eq("id", user.id).single(),
          supabase.from("jobs").select("id, depart, fin, return_time_minutes").eq("user_id", user.id).eq("job_date", job_date),
        ]),
        12000,
        "Overtime check"
      );
      if (jobsError) throw jobsError;
      if (editId && hasOvertimeEvidence) return false;
      const includeReturnTime = profile?.include_return_time_in_overtime !== false;
      const existingMinutes = (dayJobs || [])
        .filter((job) => job.id !== editId)
        .reduce((total, job) => {
          const start = makeDayjsFromJob(job_date, job.depart);
          const end = makeDayjsFromJob(job_date, job.fin);
          return total + Math.round((hoursBetween(start, end) || 0) * 60) + (includeReturnTime ? (Number(job.return_time_minutes) || 0) : 0);
        }, 0);
      const dailyMinutes = existingMinutes + Math.round(hoursDecimal * 60) + (includeReturnTime ? candidateReturnMinutes : 0);
      setOvertimeDailyMinutes(dailyMinutes);
      return dailyMinutes > 480;
    } catch (error) {
      setErr(error?.message || t("form.errors.failedLoad"));
      return true;
    }
  }

  async function handleOvertimeEvidence(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !pendingReturn) return;
    setEvidenceBusy(true);
    setErr("");
    setEvidenceValidationError("");

    const jobId = editId || crypto.randomUUID();
    const evidenceId = crypto.randomUUID();
    const storagePath = `${user.id}/${job_date}/${evidenceId}.jpg`;
    let ocrText = "";
    let ocrStatus = "processed";

    try {
      try {
        ocrText = await ocrSpaceExtract(file);
        if (!validateOvertimeSmsText(ocrText)) {
          setEvidenceValidationError(t("form.evidence.invalid"));
          return;
        }
      } catch (ocrError) {
        console.warn("Overtime evidence OCR needs review:", ocrError);
        ocrStatus = "needs_review";
      }

      const image = await compressImage(file);
      const { error: uploadError } = await supabase.storage
        .from("overtime-evidence")
        .upload(storagePath, image, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const savedJobId = await saveJob(pendingSaveMode, pendingReturn, jobId, true);
      if (!savedJobId) throw new Error(t("form.errors.saveFailed"));

      const { data: overtimeSettings } = await supabase
        .from("overtime_settings")
        .select("evidence_retention_days")
        .eq("id", true)
        .single();
      const retentionDays = Math.min(365, Math.max(1, Number(overtimeSettings?.evidence_retention_days) || 30));
      const dailyMinutes = overtimeDailyMinutes;
      const expiresAt = dayjs().add(retentionDays, "day").toISOString();
      const { error: evidenceError } = await supabase
        .from("overtime_evidence")
        .insert({ id: evidenceId, job_id: jobId, user_id: user.id, job_date, storage_path: storagePath, ocr_text: ocrText || null, ocr_status: ocrStatus, daily_minutes: dailyMinutes, expires_at: expiresAt });
      if (evidenceError) throw evidenceError;

      const { error: notificationError } = await supabase.from("manager_notifications").insert({
        employee_id: user.id,
        job_id: jobId,
        evidence_id: evidenceId,
        daily_minutes: dailyMinutes,
      });
      if (notificationError) throw notificationError;
      setPendingReturn(null);
      setHasOvertimeEvidence(false);
      setReturnStep("success");
      navigate("/form", { replace: true });
    } catch (error) {
      setErr(error?.message || t("form.evidence.failed"));
      setReturnStep("evidence");
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function compressImage(file, maxEdge = 1600, quality = 0.7) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      return await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function ocrSpaceExtract(file) {
    const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY || "helloworld";
    const blob = await compressImage(file);
    const fd = new FormData();
    fd.append("file", blob, "job.jpg");
    fd.append("language", "fre");
    fd.append("OCREngine", "2");
    fd.append("scale", "true");
    fd.append("isTable", "true");

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: fd,
    });
    if (!res.ok) throw new Error(`ocr.space HTTP ${res.status}`);
    const json = await res.json();
    if (json?.IsErroredOnProcessing) {
      throw new Error(
        Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : String(json.ErrorMessage || "ocr.space error")
      );
    }
    const text = (json?.ParsedResults || []).map((r) => r?.ParsedText || "").join("\n");
    if (!text.trim()) throw new Error("ocr.space returned no text");
    return text;
  }

  async function handleExtractFromImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setErr("");
    setInfo("");
    setExtracting(true);

    try {
      let text = "";
      let source = "ocr.space";
      try {
        text = await ocrSpaceExtract(file);
      } catch (apiErr) {
        console.warn("ocr.space failed, falling back to Tesseract:", apiErr);
        const { default: Tesseract } = await import("tesseract.js");
        const { data: ocr } = await Tesseract.recognize(file, "fra+eng");
        text = ocr?.text || "";
        source = "tesseract";
      }

      const d = parseExtractedText(text);

      if (d.job_date) setJobDate(String(d.job_date));
      if (d.ot) setOt(String(d.ot));
      if (d.depart) setDepart(String(d.depart));
      if (d.arrivee) setArrivee(String(d.arrivee));
      if (d.fin) setFin(String(d.fin));
      if (d.km_aller !== null && d.km_aller !== undefined) {
        setKmAller(String(d.km_aller));
      }
      // Auto-fill populated the form — mark dirty so Save appears
      setDirty(true);

      setInfo(t("form.toasts.filledFromImage", { source }));
    } catch (e) {
      setErr(e?.message || t("form.errors.extractFailed"));
    } finally {
      setExtracting(false);
    }
  }

  const disableInputs = locked || loadingEdit || saving;
  const badgeVariant = statusBadgeVariant(editId ? (status || "saved") : "new");

  return (
    <AppShell>
      <div className="space-y-3">
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300">
            {err}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {info}
          </div>
        )}

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-muted-foreground">{t("form.status")}</div>
              <Badge variant={badgeVariant} className="uppercase tracking-wide">
                {t(`status.${statusLabel}`)}
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="date">{t("form.date")}</Label>
                <Input
                  id="date"
                  type="date"
                  value={job_date}
                  onChange={(e) => { setJobDate(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ot">{t("form.ot")}</Label>
                <Input
                  id="ot"
                  value={ot}
                  onChange={(e) => { setOt(e.target.value); setDirty(true); }}
                  placeholder={t("form.otPlaceholder")}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="depart">{t("form.depart")}</Label>
                <Input
                  id="depart"
                  type="time"
                  value={depart}
                  onChange={(e) => { setDepart(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="arrivee">{t("form.arrival")}</Label>
                <Input
                  id="arrivee"
                  type="time"
                  value={arrivee}
                  onChange={(e) => { setArrivee(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="fin">{t("form.end")}</Label>
                <Input
                  id="fin"
                  type="time"
                  value={fin}
                  onChange={(e) => { setFin(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="km">{t("form.kmAller")}</Label>
                <Input
                  id="km"
                  type="number"
                  value={km_aller}
                  onChange={(e) => { setKmAller(e.target.value); setDirty(true); }}
                  disabled={disableInputs}
                  placeholder="0"
                />
              </div>

              <div className="grid gap-1.5">
                <Label>{t("form.totalHours")}</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm font-bold">
                  {hoursLabel}
                </div>
              </div>

              {parkingReceiptsEnabled && <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-medium">{t("form.parking.title")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {parkingFile?.name || (hasParkingReceipt ? t("form.parking.receiptSaved") : t("form.parking.description"))}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={parkingRequested}
                    disabled={disableInputs || hasParkingReceipt}
                    onChange={(event) => {
                      if (event.target.checked) parkingInputRef.current?.click();
                      else {
                        setParkingRequested(false);
                        setParkingFile(null);
                        setDirty(true);
                      }
                    }}
                    className="h-5 w-5 rounded border-input accent-primary"
                  />
                </label>
                <input ref={parkingInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleParkingReceipt} />
                {parkingRequested && (
                  <Button type="button" size="sm" variant="outline" className="w-fit" disabled={disableInputs} onClick={() => parkingInputRef.current?.click()}>
                    {parkingFile || hasParkingReceipt ? t("form.parking.replaceReceipt") : t("form.parking.chooseReceipt")}
                  </Button>
                )}
              </div>}
            </div>

            <div className="flex flex-nowrap items-center gap-1.5 pt-2">
              {dirty && (
                <Button type="button" size="sm" className="text-xs" disabled={disableInputs} onClick={saveDraft}>
                  {saving ? t("common.saving") : t("form.buttons.save")}
                </Button>
              )}

              <Button type="button" size="sm" variant="secondary" className="text-xs" disabled={disableInputs} onClick={submitJob}>
                {saving ? t("common.submitting") : t("form.buttons.submit")}
              </Button>

              {editId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => navigate("/form")}
                  disabled={loadingEdit || saving}
                >
                  {t("form.buttons.newJob")}
                </Button>
              )}

              {!locked && !editId && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto text-xs"
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
        <DialogContent className="max-w-sm p-0 overflow-hidden">
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
                <p className="mb-3 text-sm text-muted-foreground">{t("form.autofillTip.exampleDescription")}</p>
                <img
                  src="/autofill-screenshot-guide.jpg"
                  alt={t("form.autofillTip.exampleAlt")}
                  className="w-full rounded-md border object-cover"
                  style={{ maxHeight: "340px", objectPosition: "bottom" }}
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
        if (!open && !saving) {
          setReturnStep("closed");
          setShowOvertimeExample(false);
        }
      }}>
        <DialogContent className="max-w-md">
          {returnSaveError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300" role="alert">
              {returnSaveError}
            </div>
          )}
          {returnStep === "ask" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("form.return.askTitle")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.return.askDescription")}</p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" disabled={saving || returnCheckBusy} onClick={() => saveWithReturn(0, 0)}>
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
              </div>
              <DialogFooter>
                <Button type="button" disabled={saving || returnCheckBusy || normalizeNumber(returnKm) === null || normalizeNumber(returnKm) < 0} onClick={() => saveWithReturn(returnMinutes, normalizeNumber(returnKm))}>
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
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive dark:text-red-300">
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
                        src="/overtime-evidence-example.jpg"
                        alt={t("form.evidence.exampleAlt")}
                        className="max-h-96 w-full rounded object-contain"
                      />
                    </div>
                  )}
                </div>
                {evidenceValidationError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive dark:text-red-300">{evidenceValidationError}</div>}
                <input
                  ref={overtimeInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleOvertimeEvidence}
                />
              </div>
              <DialogFooter>
                <Button type="button" disabled={evidenceBusy} onClick={() => overtimeInputRef.current?.click()}>
                  {evidenceBusy ? t("form.evidence.processing") : t("form.evidence.choose")}
                </Button>
              </DialogFooter>
            </>
          )}

          {returnStep === "success" && (
            <>
              <DialogHeader><DialogTitle>{t("form.return.savedTitle")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t("form.return.savedDescription")}</p>
              <DialogFooter>
                <Button type="button" onClick={() => setReturnStep("closed")}>{t("common.ok")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
