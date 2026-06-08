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

  const [locked, setLocked] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const imageInputRef = useRef(null);

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

      const aller = data.km_aller ?? "";
      setKmAller(aller === null || aller === undefined ? "" : String(aller));

      const s = (data.status || "saved").trim();
      setStatus(s);

      const shouldLock = Boolean(data.locked) || !isEditableStatus(s);
      setLocked(shouldLock);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, user?.id]);

  async function saveDraft() {
    await saveJob("draft");
  }

  async function submitJob() {
    await saveJob("submit");
  }

  async function saveJob(mode) {
    if (!user?.id) {
      setErr(t("form.errors.notSignedIn"));
      return;
    }
    if (saving) return;

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
      };

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
      } else {
        const { data, error } = await withTimeout(
          supabase.from("jobs").insert(payload).select("id").single(),
          15000,
          "Save"
        );
        if (error) throw error;
        if (!data?.id) throw new Error(t("form.errors.insertNoId"));

        setInfo(nextStatus === "submitted" ? t("form.toasts.savedAndSubmitted") : t("form.toasts.saved"));
        setStatus(nextStatus);
        setLocked(nextLocked);

        navigate(`/form?edit=${data.id}`, { replace: true });
      }
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
    } finally {
      setSaving(false);
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
    <AppShell title={t("form.title")}>
      <div className="space-y-3">
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                  onChange={(e) => setJobDate(e.target.value)}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ot">{t("form.ot")}</Label>
                <Input
                  id="ot"
                  value={ot}
                  onChange={(e) => setOt(e.target.value)}
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
                  onChange={(e) => setDepart(e.target.value)}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="arrivee">{t("form.arrival")}</Label>
                <Input
                  id="arrivee"
                  type="time"
                  value={arrivee}
                  onChange={(e) => setArrivee(e.target.value)}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="fin">{t("form.end")}</Label>
                <Input
                  id="fin"
                  type="time"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  disabled={disableInputs}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="km">{t("form.kmAller")}</Label>
                <Input
                  id="km"
                  type="number"
                  value={km_aller}
                  onChange={(e) => setKmAller(e.target.value)}
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
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" disabled={disableInputs} onClick={saveDraft}>
                {saving ? t("common.saving") : t("form.buttons.save")}
              </Button>

              <Button type="button" variant="secondary" disabled={disableInputs} onClick={submitJob}>
                {saving ? t("common.submitting") : t("form.buttons.submit")}
              </Button>

              {!locked && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disableInputs || extracting}
                    onClick={() => imageInputRef.current?.click()}
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

              {editId && (
                <Button
                  type="button"
                  variant="ghost"
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
    </AppShell>
  );
}
