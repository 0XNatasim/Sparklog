import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { companyDate } from "@/lib/company-time";
import {
  MINUTE_EDIT_REASON_MAX, addProofAsOwner, adjustJobTimes, deleteJobAsOwner, fetchDayProofs, fetchEditableJobs, minutesBetweenTimes, setMinuteEditEnabled, submitJobAsOwner, submittableJobs, timesChanged, useMinuteEditEnabled, validateTimesAdjust,
} from "@/lib/minute-edit";
import { useT } from "@/lib/use-t";

const hhmm = (value) => String(value || "").slice(0, 5);
const minutesLabel = (minutes) => (minutes == null ? "—" : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`);

// One work sheet of the chosen day: its Départ / Fin to move, a reason, Save.
function JobRow({ job, proofs, dayMinutes, onSaved, t }) {
  const fileRef = useRef(null);
  const [depart, setDepart] = useState(hhmm(job.depart));
  const [fin, setFin] = useState(hhmm(job.fin));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirmDialog();
  const problems = validateTimesAdjust({ depart, fin, reason });
  const changed = timesChanged(job, depart, fin);
  const before = minutesBetweenTimes(job.depart, job.fin);
  const after = minutesBetweenTimes(depart, fin);

  async function save() {
    if (busy || !changed || problems.length) return;
    const ok = await confirm(t("minuteEdit.confirmSave", { ot: job.ot || "—", from: `${hhmm(job.depart)} → ${hhmm(job.fin)}`, to: `${depart} → ${fin}` }));
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await adjustJobTimes(supabase, { jobId: job.id, depart, fin, reason });
      onSaved(t("minuteEdit.saved"));
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.save"));
    } finally {
      setBusy(false);
    }
  }

  const reasonOk = !problems.includes("reason");
  async function remove() {
    if (busy || !reasonOk) return;
    const ok = await confirm(t("minuteEdit.confirmDelete", { ot: job.ot || "—", when: `${hhmm(job.depart)} → ${hhmm(job.fin)}` }));
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await deleteJobAsOwner(supabase, { jobId: job.id, reason });
      onSaved(t("minuteEdit.deleted"));
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.delete"));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = job.status === "saved" || job.status === "updated";
  async function submit() {
    if (busy || !reasonOk || !canSubmit) return;
    const ok = await confirm(t("minuteEdit.confirmSubmit", { ot: job.ot || "—", when: `${hhmm(job.depart)} → ${hhmm(job.fin)}` }));
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await submitJobAsOwner(supabase, { jobId: job.id, reason });
      onSaved(t("minuteEdit.submitted"));
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.submit"));
    } finally {
      setBusy(false);
    }
  }

  async function addProof(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy || !reasonOk) return;
    const ok = await confirm(t("minuteEdit.confirmProof", { ot: job.ot || "—" }));
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await addProofAsOwner(supabase, { job, file, reason, dailyMinutes: dayMinutes });
      onSaved(t("minuteEdit.proofAdded"));
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.proof"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{job.ot || "—"}</span>
        <Badge variant="outline">{t(`status.${job.status}`)}</Badge>
        <span className="ml-auto text-muted-foreground">{minutesLabel(before)} → {minutesLabel(after)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1"><Label htmlFor={`me-d-${job.id}`}>{t("minuteEdit.depart")}</Label>
          <Input id={`me-d-${job.id}`} type="time" value={depart} onChange={(event) => setDepart(event.target.value)} disabled={busy} /></div>
        <div className="grid gap-1"><Label htmlFor={`me-f-${job.id}`}>{t("minuteEdit.fin")}</Label>
          <Input id={`me-f-${job.id}`} type="time" value={fin} onChange={(event) => setFin(event.target.value)} disabled={busy} /></div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`me-r-${job.id}`}>{t("minuteEdit.reason")}</Label>
        <Input id={`me-r-${job.id}`} value={reason} maxLength={MINUTE_EDIT_REASON_MAX} placeholder={t("minuteEdit.reasonPlaceholder")} onChange={(event) => setReason(event.target.value)} disabled={busy} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className={proofs.length ? "" : "text-muted-foreground"}>{proofs.length ? t("minuteEdit.proofCount", { n: proofs.length }) : t("minuteEdit.proofNone")}</span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label={t("minuteEdit.proofFile")} onChange={addProof} />
        <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={busy || !reasonOk} title={reasonOk ? undefined : t("minuteEdit.proofNeedsReason")} onClick={() => fileRef.current?.click()}>
          {t("minuteEdit.proofAdd")}
        </Button>
      </div>
      {problems.includes("interval") && <p className="text-xs text-destructive">{t("form.errors.invalidInterval")}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !changed || problems.length > 0} onClick={save}>{busy ? t("common.saving") : t("minuteEdit.save")}</Button>
        {canSubmit && (
          <Button type="button" size="sm" variant="outline" disabled={busy || !reasonOk || changed} title={changed ? t("minuteEdit.submitSaveFirst") : reasonOk ? undefined : t("minuteEdit.proofNeedsReason")} onClick={submit}>
            <Send className="mr-1 h-4 w-4" aria-hidden="true" />{t("minuteEdit.submit")}
          </Button>
        )}
        <Button type="button" size="sm" variant="destructive" className="ml-auto" disabled={busy || !reasonOk} onClick={remove}>
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />{t("minuteEdit.delete")}
        </Button>
      </div>
      {confirmDialog}
    </div>
  );
}

// Avancé › Feuille de temps d'urgence › « Modifier les minutes » (owner only, migration 0152).
export default function MinuteEditPanel({ people = [] }) {
  const t = useT();
  const enabled = useMinuteEditEnabled();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [switching, setSwitching] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [jobDate, setJobDate] = useState(companyDate());
  const [loaded, setLoaded] = useState({ key: "", rows: [], proofs: [] });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [reload, setReload] = useState(0);
  const [dayReason, setDayReason] = useState("");
  const [daySubmitting, setDaySubmitting] = useState(false);

  // What is shown: the sheets of the chosen employee and day once loaded (null while loading or nothing chosen).
  const key = enabled && employeeId && jobDate ? `${employeeId}|${jobDate}|${reload}` : "";
  const jobs = key && loaded.key === key ? loaded.rows : null;
  const dayMinutes = (jobs || []).reduce((sum, row) => sum + (minutesBetweenTimes(row.depart, row.fin) || 0), 0);
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    Promise.all([fetchEditableJobs(supabase, employeeId, jobDate), fetchDayProofs(supabase, employeeId, jobDate).catch(() => [])])
      .then(([rows, proofs]) => { if (alive) setLoaded({ key, rows, proofs }); })
      .catch((failure) => { if (alive) { setLoaded({ key, rows: [], proofs: [] }); setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.load")); } });
    return () => { alive = false; };
  }, [key, employeeId, jobDate, t]);

  // Submits every saved / updated sheet of the day, in the order of the Départ, with one reason; stops at the first refusal.
  const toSubmit = submittableJobs(jobs);
  const dayReasonOk = dayReason.trim().length >= 3;
  async function submitDay() {
    if (daySubmitting || !dayReasonOk || toSubmit.length === 0) return;
    if (!(await confirm(t("minuteEdit.confirmSubmitDay", { n: toSubmit.length })))) return;
    setDaySubmitting(true);
    setError("");
    setInfo("");
    let done = 0;
    try {
      for (const job of toSubmit) {
        await submitJobAsOwner(supabase, { jobId: job.id, reason: dayReason });
        done += 1;
      }
      setInfo(t("minuteEdit.submittedDay", { n: done }));
      setDayReason("");
    } catch (failure) {
      setError(`${friendlyErrorMessage(failure, t, "minuteEdit.errors.submit")}${done ? ` ${t("minuteEdit.submittedPartial", { n: done })}` : ""}`);
    } finally {
      setDaySubmitting(false);
      setReload((value) => value + 1);
    }
  }

  async function toggle() {
    if (switching) return;
    const turnOn = !enabled;
    if (turnOn && !(await confirm(t("minuteEdit.confirmOn")))) return;
    setSwitching(true);
    setError("");
    setInfo("");
    try {
      await setMinuteEditEnabled(supabase, turnOn);
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "minuteEdit.errors.switch"));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Card className={enabled ? "border-red-600" : ""}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div className="flex-1">
            <div className="font-semibold">{t("minuteEdit.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("minuteEdit.description")}</p>
          </div>
          <Button type="button" size="sm" variant={enabled ? "destructive" : "outline"} disabled={switching} onClick={toggle} aria-pressed={enabled}>
            {enabled ? t("minuteEdit.turnOff") : t("minuteEdit.turnOn")}
          </Button>
        </div>
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>}
        {info && <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{info}</div>}
        {enabled && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="me-employee">{t("emergency.employee")}</Label>
                <Select id="me-employee" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setInfo(""); }}>
                  <option value="">{t("emergency.employeePlaceholder")}</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="me-date">{t("form.date")}</Label>
                <Input id="me-date" type="date" value={jobDate} onChange={(event) => { setJobDate(event.target.value); setInfo(""); }} />
              </div>
            </div>
            {employeeId && jobs === null && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
            {jobs && jobs.length === 0 && employeeId && <p className="text-sm text-muted-foreground">{t("minuteEdit.none")}</p>}
            {toSubmit.length > 0 && (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <div className="grid gap-1">
                  <Label htmlFor="me-day-reason">{t("minuteEdit.submitDayReason", { n: toSubmit.length })}</Label>
                  <Input id="me-day-reason" value={dayReason} maxLength={MINUTE_EDIT_REASON_MAX} placeholder={t("minuteEdit.reasonPlaceholder")} onChange={(event) => setDayReason(event.target.value)} disabled={daySubmitting} />
                </div>
                <p className="text-xs text-muted-foreground">{t("minuteEdit.submitNote")}</p>
                <Button type="button" size="sm" disabled={daySubmitting || !dayReasonOk} onClick={submitDay}>
                  <Send className="mr-1 h-4 w-4" aria-hidden="true" />{daySubmitting ? t("common.saving") : t("minuteEdit.submitDay", { n: toSubmit.length })}
                </Button>
              </div>
            )}
            {jobs && jobs.map((job) => (
              <JobRow key={`${job.id}-${job.depart}-${job.fin}-${loaded.proofs.length}`} job={job} proofs={loaded.proofs.filter((proof) => proof.job_id === job.id)} dayMinutes={dayMinutes} t={t} onSaved={(message) => { setInfo(message); setReload((value) => value + 1); }} />
            ))}
          </div>
        )}
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
