import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buildOcrRows, countOcrStates, filterOcrRows } from "@/lib/ocr-readings";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { supabase } from "@/supabaseClient";

const EVIDENCE_COLUMNS = "id, job_id, user_id, job_date, created_at, storage_path, ocr_status, proof_ot, proof_client_minutes, proof_return_minutes, proof_read_at";
const JOB_COLUMNS = "id, user_id, job_date, status, ot, depart, fin, return_time_minutes, km_total, km_aller, km_retour";
const BADGE = { ok: "success", mismatch: "destructive", unread: "warning", notRead: "secondary" };

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
export default function OcrReadings() {
  const t = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [state, setState] = useState("read");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: evidence, error: evidenceError } = await withTimeout(
        supabase.from("overtime_evidence").select(EVIDENCE_COLUMNS).order("created_at", { ascending: false }).limit(QUERY_BUDGETS.ocrReadings), 12000);
      if (evidenceError) throw evidenceError;
      const userIds = [...new Set((evidence || []).map((row) => row.user_id).filter(Boolean))];
      const dates = [...new Set((evidence || []).map((row) => String(row.job_date).slice(0, 10)).filter(Boolean))];
      const [people, jobs] = await Promise.all([
        inChunks(userIds, (part) => supabase.from("profiles").select("id, full_name, first_trip_unpaid, ten_hour_days").in("id", part)),
        inChunks(userIds, (part) => supabase.from("jobs").select(JOB_COLUMNS).in("user_id", part).in("job_date", dates).limit(QUERY_BUDGETS.anomalyApprovedPeers)),
      ]);
      if (alive) setRows(buildOcrRows(evidence, jobs, new Map(people.map((person) => [person.id, person]))));
    })().catch((failure) => { if (alive) setError(friendlyErrorMessage(failure, t, "ocr.loadFailed")); });
    return () => { alive = false; };
  }, [t]);

  const counts = useMemo(() => countOcrStates(rows), [rows]);
  const shown = useMemo(() => filterOcrRows(rows, { state, query }), [rows, state, query]);

  async function view(row) {
    if (!row.storagePath || opening) return;
    setOpening(row.id);
    try {
      const { data, error: signError } = await withTimeout(supabase.storage.from("overtime-evidence").createSignedUrl(row.storagePath, 600), 12000);
      if (signError || !data?.signedUrl) throw signError || new Error("no_url");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("ocr.imageUnavailable"));
    } finally {
      setOpening("");
    }
  }

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
              {["ok", "mismatch", "unread", "notRead"].map((key) => (
                <Badge key={key} variant={BADGE[key]}>{t(`ocr.state.${key}`)} : {counts[key]}</Badge>
              ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={state} onChange={(event) => setState(event.target.value)} aria-label={t("ocr.filterLabel")}>
              <option value="read">{t("ocr.filter.read")}</option>
              <option value="check">{t("ocr.filter.check")}</option>
              <option value="ok">{t("ocr.filter.ok")}</option>
              <option value="notRead">{t("ocr.filter.notRead")}</option>
              <option value="all">{t("ocr.filter.all")}</option>
            </Select>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ocr.search")} aria-label={t("ocr.search")} />
          </div>
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
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.jobOt || "—"}</td>
                  {cell(row, "ot", row.found.ot)}
                  {cell(row, "client", row.found.clientMinutes, minutes)}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{minutes(row.expected?.clientMinutes)}</td>
                  {cell(row, "return", row.found.returnMinutes, minutes)}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{minutes(row.expected?.returnMinutes)}</td>
                  <td className="whitespace-nowrap px-3 py-2"><Badge variant={BADGE[row.state]}>{t(`ocr.state.${row.state}`)}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{row.readAt ? dayjs(row.readAt).format("DD MMM HH:mm") : "—"}</td>
                  <td className="px-3 py-2">
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
      {rows && <p className="text-xs text-muted-foreground">{t("ocr.footnote", { max: QUERY_BUDGETS.ocrReadings })}</p>}
    </div>
  );
}
