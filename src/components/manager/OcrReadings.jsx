import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Eye, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { lazyPanel } from "@/components/lazy-panel";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import OcrDownload from "@/components/manager/OcrDownload";
import { proofSheetLines } from "@/lib/ocr-sheet";
import { OCR_FIRST_DAY, buildOcrRows, canReread, canRequeue, countOcrStates, filterOcrRows, ocrDays } from "@/lib/ocr-readings";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { requeueProofs } from "@/lib/overtime-proofs";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { supabase } from "@/supabaseClient";

const EmployeesPanel = lazyPanel(() => import("@/components/EmployeesPanel"));
const EVIDENCE_COLUMNS = "id, job_id, user_id, job_date, created_at, storage_path, ocr_status, proof_ot, proof_client_minutes, proof_return_minutes, proof_read_at, ocr_attempts, ocr_next_try_at";
const JOB_COLUMNS = "id, user_id, job_date, status, updated_at, ot, depart, arrivee, fin, return_time_minutes, km_total, km_aller, km_retour";
const queueTime = (iso) => new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const BADGE = { ok: "success", mismatch: "destructive", wrongDoc: "destructive", unread: "warning", failed: "destructive", queued: "info", notRead: "secondary" };
const AUTO_REFRESH_MS = 60000;

async function inChunks(ids, run) {
  const rows = [];
  for (let i = 0; i < ids.length; i += QUERY_BUDGETS.inListChunk) {
    const { data, error } = await withTimeout(run(ids.slice(i, i + QUERY_BUDGETS.inListChunk)), 12000);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

// À traiter › OCR: one line per overtime proof screenshot — what the reader found (OT, minutes at the client, return minutes)
// next to what the work order says — so the readings can be checked at a glance. Read only; nothing here changes a job.
// The work order the proof belongs to, beside the screenshot: what the reader found against what the job says (gaps in red).
function JobSummary({ row, t }) {
  const job = row.job;
  const mins = (value) => (value == null ? "—" : `${value} min`);
  const line = (label, value, bad = false) => (
    <div key={label} className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${bad ? "font-bold text-destructive" : ""}`}>{value}</dd>
    </div>
  );
  if (!job) return <p className="text-sm text-muted-foreground">{t("ocr.preview.noJob")}</p>;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t("ocr.preview.job")}</h3>
      <dl>
        {proofSheetLines(row, t).map((item) => line(item.label, item.value))}
      </dl>
      <h3 className="font-semibold">{t("ocr.preview.compare")}</h3>
      <dl>
        {line(t("ocr.col.otRead"), `${row.found.ot ?? "—"} / ${job.ot || "—"}`, row.wrong.has("ot"))}
        {line(t("ocr.preview.clientLine"), `${mins(row.found.clientMinutes)} / ${mins(row.expected?.clientMinutes)}`, row.wrong.has("client"))}
        {line(t("ocr.preview.returnLine"), `${mins(row.found.returnMinutes)} / ${mins(row.expected?.returnMinutes)}`, row.wrong.has("return"))}
      </dl>
    </div>
  );
}

export default function OcrReadings() {
  const t = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [state, setState] = useState("read");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState(""); // "" = every day
  const [opening, setOpening] = useState("");
  const navigate = useNavigate();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [preview, setPreview] = useState(null); // { row, url } — the screenshot next to its job
  const [cardId, setCardId] = useState(null); // employee whose card is open
  const [sendingBack, setSendingBack] = useState("");
  const [sendBackOn, setSendBackOn] = useState(false); // Configuration › « Retour pour correction »

  const [reload, setReload] = useState(0);
  const [rereading, setRereading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: evidence, error: evidenceError } = await withTimeout(
        supabase.from("overtime_evidence").select(EVIDENCE_COLUMNS).gte("job_date", OCR_FIRST_DAY).order("created_at", { ascending: false }).limit(QUERY_BUDGETS.ocrReadings), 12000);
      if (evidenceError) throw evidenceError;
      // The switch of the « Send back for correction » button (a missing column = off).
      const { data: setting } = await withTimeout(supabase.from("overtime_settings").select("*").eq("id", true).maybeSingle(), 12000).catch(() => ({ data: null }));
      if (alive) setSendBackOn(setting?.send_back_enabled === true);
      const userIds = [...new Set((evidence || []).map((row) => row.user_id).filter(Boolean))];
      const dates = [...new Set((evidence || []).map((row) => String(row.job_date).slice(0, 10)).filter(Boolean))];
      const [people, jobs] = await Promise.all([
        inChunks(userIds, (part) => supabase.from("profiles").select("id, full_name, first_trip_unpaid, ten_hour_days").in("id", part)),
        inChunks(userIds, (part) => supabase.from("jobs").select(JOB_COLUMNS).in("user_id", part).in("job_date", dates).limit(QUERY_BUDGETS.anomalyApprovedPeers)),
      ]);
      if (alive) { setRows(buildOcrRows(evidence, jobs, new Map(people.map((person) => [person.id, person])))); setError(""); }
    })().catch((failure) => { if (alive) setError(friendlyErrorMessage(failure, t, "ocr.loadFailed")); });
    return () => { alive = false; };
  }, [t, reload]);

  // « Renvoyer pour correction »: gives the submitted job back to the employee (same call as the other manager screens: the job
  // becomes editable again, so the proof can be replaced from the Historique clock). Refused if the job changed since it was read.
  async function sendBack(row) {
    if (!row.job || row.job.status !== "submitted" || sendingBack) return;
    if (!(await confirm(t("ocr.sendBackConfirm", { name: row.name || "—", ot: row.jobOt || "—" })))) return;
    setSendingBack(row.id);
    setError("");
    try {
      const { error: rpcError } = await withTimeout(supabase.rpc("return_job_for_correction", { p_job_id: row.job.id, p_expected_updated_at: row.job.updated_at || null }), 12000);
      if (rpcError) throw rpcError;
      setNotice(t("ocr.sentBack", { name: row.name || "—", ot: row.jobOt || "—" }));
      setPreview(null);
      setReload((value) => value + 1);
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "ocr.sendBackFailed"));
    } finally {
      setSendingBack("");
    }
  }

  // « Relire »: puts the proofs back in the reading queue (one reading a minute, a refused proof goes to the bottom).
  async function reread(targets) {
    if (rereading || targets.length === 0) return;
    setRereading(true);
    setError("");
    setNotice("");
    try {
      // At most 300 at a time (the database refuses more).
      const ids = targets.map((row) => row.id);
      let moved = 0;
      for (let i = 0; i < ids.length; i += 300) moved += await requeueProofs(supabase, ids.slice(i, i + 300));
      setNotice(t("ocr.requeued", { count: moved }));
      setReload((value) => value + 1);
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t, "ocr.rereadFailed"));
    } finally {
      setRereading(false);
    }
  }

  const counts = useMemo(() => countOcrStates(rows), [rows]);
  const shown = useMemo(() => filterOcrRows(rows, { state, query, day }), [rows, state, query, day]);
  const days = useMemo(() => ocrDays(rows), [rows]);
  const waiting = counts.queued;
  const rereadable = useMemo(() => (rows || []).filter(canReread), [rows]);
  const requeueable = useMemo(() => shown.filter(canRequeue), [shown]);

  async function rereadEverything() {
    if (requeueable.length === 0) return;
    if (!(await confirm(t("ocr.rereadEverythingConfirm", { count: requeueable.length })))) return;
    await reread(requeueable);
  }

  // While proofs wait in the queue the table reloads by itself every minute (one reading a minute).
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setReload((value) => value + 1), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  async function view(row) {
    if (!row.storagePath || opening) return;
    setOpening(row.id);
    try {
      const { data, error: signError } = await withTimeout(supabase.storage.from("overtime-evidence").createSignedUrl(row.storagePath, 600), 12000);
      if (signError || !data?.signedUrl) throw signError || new Error("no_url");
      setPreview({ row, url: data.signedUrl });
    } catch {
      setError(t("ocr.imageUnavailable"));
    } finally {
      setOpening("");
    }
  }

  const timesheetLink = (row, jobId) => `/manager/v3/time?tab=timesheets&emp=${row.userId}&date=${row.jobDate}${jobId ? `&job=${jobId}` : ""}`;

  const minutes = (value) => (value == null ? "—" : `${value} min`);
  const cell = (row, field, value, format = (v) => (v == null ? "—" : v)) => (
    <td className={`whitespace-nowrap px-3 py-2 ${row.wrong.has(field) ? "font-bold text-destructive" : ""}`}>{format(value)}</td>
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">{t("ocr.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ocr.description")}</p>
          </div>
          {rows && (
            <div className="flex flex-wrap gap-2 text-xs">
              {["ok", "mismatch", "wrongDoc", "unread", "failed", "queued", "notRead"].map((key) => (
                <Badge key={key} variant={BADGE[key]}>{t(`ocr.state.${key}`)} : {counts[key]}</Badge>
              ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={state} onChange={(event) => setState(event.target.value)} aria-label={t("ocr.filterLabel")}>
              <option value="read">{t("ocr.filter.read")}</option>
              <option value="check">{t("ocr.filter.check")}</option>
              <option value="ok">{t("ocr.filter.ok")}</option>
              <option value="reread">{t("ocr.filter.reread")}</option>
              <option value="queued">{t("ocr.filter.queued")}</option>
              <option value="notRead">{t("ocr.filter.notRead")}</option>
              <option value="all">{t("ocr.filter.all")}</option>
            </Select>
            <Select value={day} onChange={(event) => setDay(event.target.value)} aria-label={t("ocr.dayLabel")}>
              <option value="">{t("ocr.allDays")}</option>
              {days.map((entry) => (
                <option key={entry.date} value={entry.date}>{dayjs(entry.date).format("ddd DD MMM")} ({entry.count})</option>
              ))}
            </Select>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ocr.search")} aria-label={t("ocr.search")} />
          </div>
          {rows && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={rereading} onClick={() => setReload((value) => value + 1)}>
                <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />{t("ocr.refresh")}
              </Button>
              <Button type="button" size="sm" disabled={rereading || rereadable.length === 0} onClick={() => reread(rereadable)}>
                {rereading ? t("ocr.rereading") : t("ocr.rereadAll", { count: rereadable.length })}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={rereading || requeueable.length === 0} onClick={rereadEverything}>
                {t("ocr.rereadEverything", { count: requeueable.length })}
              </Button>
              <OcrDownload rows={rows} />
            </div>
          )}
          {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {rows === null && !error && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
      {rows && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("ocr.col.date")}</th>
                <th className="px-3 py-2">{t("ocr.col.employee")}</th>
                <th className="px-3 py-2">{t("ocr.col.jobOt")}</th>
                <th className="px-3 py-2">{t("ocr.col.otRead")}</th>
                <th className="px-3 py-2">{t("ocr.col.clientRead")}</th>
                <th className="px-3 py-2">{t("ocr.col.clientExpected")}</th>
                <th className="px-3 py-2">{t("ocr.col.returnRead")}</th>
                <th className="px-3 py-2">{t("ocr.col.returnExpected")}</th>
                <th className="px-3 py-2">{t("ocr.col.result")}</th>
                <th className="px-3 py-2">{t("ocr.col.readAt")}</th>
                <th className="px-3 py-2"><span className="sr-only">{t("ocr.view")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2">{row.jobDate ? dayjs(row.jobDate).format("DD MMM") : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {row.name && row.userId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="font-medium text-primary hover:underline">{row.name}</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onSelect={() => setCardId(row.userId)}>{t("ocr.link.card")}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(timesheetLink(row))}>{t("ocr.link.timesheet")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (row.name || "—")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {row.jobOt && row.userId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="text-primary hover:underline">{row.jobOt}</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onSelect={() => navigate(timesheetLink(row, row.jobId))}>{t("ocr.link.job")}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(timesheetLink(row))}>{t("ocr.link.day")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (row.jobOt || "—")}
                  </td>
                  {cell(row, "ot", row.found.ot)}
                  {cell(row, "client", row.found.clientMinutes, minutes)}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{minutes(row.expected?.clientMinutes)}</td>
                  {cell(row, "return", row.found.returnMinutes, minutes)}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{minutes(row.expected?.returnMinutes)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge variant={BADGE[row.state]}>{t(`ocr.state.${row.state}`)}</Badge>
                    {row.state === "queued" && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {row.attempts > 0 ? t("ocr.queueTried", { count: row.attempts, max: 5 }) : t("ocr.queueNever")}
                        {row.nextTryAt && new Date(row.nextTryAt) > new Date() ? ` · ${t("ocr.queueNext", { time: queueTime(row.nextTryAt) })}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{row.readAt ? dayjs(row.readAt).format("DD MMM HH:mm") : "—"}</td>
                  <td className="flex gap-1 px-3 py-2">
                    {sendBackOn && row.job?.status === "submitted" && (
                      <Button type="button" size="sm" variant="outline" disabled={Boolean(sendingBack)} onClick={() => sendBack(row)} aria-label={t("ocr.sendBack")} title={t("ocr.sendBack")}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    {canRequeue(row) && (
                      <Button type="button" size="sm" variant="outline" disabled={rereading} onClick={() => reread([row])} aria-label={t("ocr.reread")} title={t("ocr.reread")}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    {row.storagePath && (
                      <Button type="button" size="sm" variant="outline" disabled={opening === row.id} onClick={() => view(row)} aria-label={t("ocr.view")} title={t("ocr.view")}>
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">{t("ocr.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>{t("ocr.preview.title")}{preview.row.jobOt ? ` · OT ${preview.row.jobOt}` : ""}</DialogTitle>
                <DialogDescription>{preview.row.name || "—"} · {preview.row.jobDate ? dayjs(preview.row.jobDate).format("DD MMM YYYY") : "—"}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-[1fr,20rem]">
                <img src={preview.url} alt={t("ocr.view")} className="max-h-[70vh] w-full rounded-md border object-contain" />
                <div className="space-y-3">
                  <JobSummary row={preview.row} t={t} />
                  {sendBackOn && preview.row.job?.status === "submitted" && (
                    <Button type="button" variant="outline" className="w-full" disabled={Boolean(sendingBack)} onClick={() => sendBack(preview.row)}>
                      <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />{t("ocr.sendBack")}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(cardId)} onOpenChange={(open) => { if (!open) setCardId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ocr.link.card")}</DialogTitle>
            <DialogDescription>{(rows || []).find((row) => row.userId === cardId)?.name || ""}</DialogDescription>
          </DialogHeader>
          {cardId && <EmployeesPanel tabbed onlyId={cardId} />}
        </DialogContent>
      </Dialog>
      {confirmDialog}
      {rows && <p className="text-xs text-muted-foreground">{t("ocr.footnote", { max: QUERY_BUDGETS.ocrReadings })}</p>}
    </div>
  );
}
