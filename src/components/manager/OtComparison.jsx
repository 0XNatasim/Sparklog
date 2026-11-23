import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { downloadFile, XLSX_TYPE } from "@/lib/download-file";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { OCR_FIRST_DAY } from "@/lib/ocr-readings";
import { COMPARISON_HEADER_HEIGHTS, COMPARISON_WIDTHS, comparisonFileName, comparisonTable, remarkText } from "@/lib/ot-compare-export";
import { VERDICTS, brittonDays, buildOtComparison, comparisonDays, countVerdicts, fetchComparisonData, filterComparison } from "@/lib/ot-compare";
import { buildXlsx } from "@/lib/xlsx-write";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";
import { minutesText } from "@/lib/overtime-proof-check";

const BADGE = { ok: "success", noProof: "secondary", formGap: "warning", brittonGap: "destructive", missingBritton: "destructive", missingSparklog: "destructive" };

// One figure, in red when this source is the odd one out for that field.
function Num({ values, field, red, sms = false }) {
  if (!values || values[field] == null) return <span className="text-muted-foreground">{sms ? "SMS" : "—"}</span>;
  return <span className={red.has(field) ? "font-bold text-destructive" : ""}>{minutesText(values[field])}</span>;
}

// A proof of the old kind: the screenshot of the approval text message (no minutes on it).
const hasSms = (entry) => (entry.proofs || []).some((proof) => proof.state === "sms");

// The columns, grouped by what they measure: « chez le client » (Britton → preuve de temps → fiche de travail), then « retour ».
const FIELD_GROUPS = [["client", "otc.col.client"], ["return", "otc.col.return"]];
// A work order number, as each source says it (red when it differs from the others).
function OtCell({ text, red, sms = false }) {
  if (!text) return <span className="text-muted-foreground">{sms ? "SMS" : "—"}</span>;
  return <span className={red ? "font-bold text-destructive" : ""}>{text}</span>;
}
const SOURCE_COLUMNS = [["britton", "otc.src.britton"], ["form", "otc.src.proof"], ["sparklog", "otc.src.sheet"]];

// À traiter › OCR › « Par OT »: Britton · form · Sparklog side by side for each overtime work order, with one verdict.
export default function OtComparison({ britton, proofRows, onView }) {
  const t = useT();
  const navigate = useNavigate();
  const days = useMemo(() => brittonDays(britton).filter((date) => date >= OCR_FIRST_DAY), [britton]);
  const loadDays = useMemo(() => comparisonDays(britton), [britton]);
  const daysKey = loadDays.join(",");
  const [data, setData] = useState({ key: "", jobs: [], people: new Map(), truncated: false });
  const [error, setError] = useState("");
  const [verdict, setVerdict] = useState("attention");
  const [day, setDay] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    if (!daysKey) return undefined;
    fetchComparisonData(supabase, daysKey.split(","))
      .then((result) => { if (alive) { setData({ key: daysKey, ...result }); setError(""); } })
      .catch((failure) => { if (alive) setError(friendlyErrorMessage(failure, t, "otc.loadFailed")); });
    return () => { alive = false; };
  }, [daysKey, t]);

  const loaded = data.key === daysKey;
  const entries = useMemo(() => (loaded ? buildOtComparison({ proofRows, britton, jobs: data.jobs, people: data.people }) : []), [loaded, proofRows, britton, data]);
  const counts = useMemo(() => countVerdicts(entries), [entries]);
  const shown = useMemo(() => filterComparison(entries, { verdict, day, query }), [entries, verdict, day, query]);
  const dayOptions = useMemo(() => [...new Set(entries.map((entry) => entry.day).filter(Boolean))].sort().reverse(), [entries]);
  const attention = entries.length - counts.ok;
  function download() {
    if (shown.length === 0) return;
    const { headers, merges, rows, fills } = comparisonTable(shown, t);
    downloadFile(buildXlsx({ rows: [...headers, ...rows], headerRows: 2, merges, rowHeights: COMPARISON_HEADER_HEIGHTS, rowFills: [null, null, ...fills], widths: COMPARISON_WIDTHS, sheetName: t("otc.sheetName") }), comparisonFileName(shown), XLSX_TYPE);
  }
  const timesheetLink = (entry) => `/manager/v3/time?tab=timesheets&emp=${entry.userId}&date=${entry.jobDate}${entry.job ? `&job=${entry.job.id}` : ""}`;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">{t("otc.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("otc.description")}</p>
          </div>
          {loaded && (
            <div className="flex flex-wrap gap-2 text-xs">
              {VERDICTS.map((key) => <Badge key={key} variant={BADGE[key]} title={t(`otc.hint.${key}`)}>{t(`otc.verdict.${key}`)} : {counts[key]}</Badge>)}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={verdict} onChange={(event) => setVerdict(event.target.value)} aria-label={t("otc.filterLabel")}>
              <option value="attention">{t("otc.filter.attention", { count: attention })}</option>
              <option value="all">{t("otc.filter.all", { count: entries.length })}</option>
              {VERDICTS.map((key) => <option key={key} value={key}>{t(`otc.verdict.${key}`)} ({counts[key]})</option>)}
            </Select>
            <Select value={day} onChange={(event) => setDay(event.target.value)} aria-label={t("ocr.dayLabel")}>
              <option value="">{t("ocr.allDays")}</option>
              {dayOptions.map((date) => <option key={date} value={date}>{dayjs(date).format("ddd DD MMM")}</option>)}
            </Select>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ocr.search")} aria-label={t("ocr.search")} />
          </div>
          {loaded && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={shown.length === 0} onClick={download} title={t("otc.downloadHint")}>
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />{t("otc.download", { count: shown.length })}
              </Button>
            </div>
          )}
          {data.truncated && <p className="text-sm text-muted-foreground" role="status">{t("otc.truncated")}</p>}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {days.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("otc.noDays")}</p>}
      {days.length > 0 && !loaded && !error && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
      {loaded && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th rowSpan={2} className="px-3 py-2 align-bottom">{t("ocr.col.date")}</th>
                <th rowSpan={2} className="px-3 py-2 align-bottom">{t("ocr.col.employee")}</th>
                <th colSpan={3} className="border-l px-3 py-2 text-center">{t("otc.col.ot")}</th>
                {FIELD_GROUPS.map(([field, labelKey]) => <th key={field} colSpan={3} className="border-l px-3 py-2 text-center">{t(labelKey)}</th>)}
                <th rowSpan={2} className="border-l px-3 py-2 align-bottom">{t("ocr.col.result")}</th>
                <th rowSpan={2} className="px-3 py-2"><span className="sr-only">{t("ocr.view")}</span></th>
              </tr>
              <tr>
                {SOURCE_COLUMNS.map(([source, labelKey], index) => <th key={`ot-${source}`} className={`px-3 py-1 text-center normal-case ${index === 0 ? "border-l" : ""}`}>{t(labelKey)}</th>)}
                {FIELD_GROUPS.flatMap(([field]) => SOURCE_COLUMNS.map(([source, labelKey], index) => (
                  <th key={`${field}-${source}`} className={`px-3 py-1 text-center normal-case ${index === 0 ? "border-l" : ""}`}>{t(labelKey)}</th>
                )))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((entry) => (
                <tr key={entry.key}>
                  <td className="whitespace-nowrap px-3 py-2">{dayjs(entry.day).format("DD MMM")}{entry.job && entry.jobDate !== entry.day && <div className="text-xs text-muted-foreground">{t("otc.sheetDay", { date: dayjs(entry.jobDate).format("DD MMM") })}</div>}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {entry.userId && entry.shownName ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className={`font-medium hover:underline ${entry.verdict === "missingBritton" ? (entry.personInBritton ? "font-bold text-green-700" : "font-bold text-destructive") : "text-primary"}`}>{entry.shownName}</button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => navigate(timesheetLink(entry))}>{entry.job ? t("ocr.link.job") : t("ocr.link.timesheet")}</DropdownMenuItem></DropdownMenuContent>
                      </DropdownMenu>
                    ) : (entry.shownName || "—")}
                  </td>
                  {SOURCE_COLUMNS.map(([source], index) => (
                    <td key={`ot-${source}`} className={`whitespace-nowrap px-3 py-2 text-center ${index === 0 ? "border-l" : ""}`}>
                      <OtCell text={entry.ots?.[source]} red={entry.otRed?.has(source) || (source === "sparklog" && entry.verdict === "missingBritton")} sms={source === "form" && hasSms(entry)} />
                    </td>
                  ))}
                  {FIELD_GROUPS.flatMap(([field]) => SOURCE_COLUMNS.map(([source], index) => (
                    <td key={`${field}-${source}`} className={`whitespace-nowrap px-3 py-2 text-center ${index === 0 ? "border-l" : ""}`} title={source === "britton" ? entry.britton?.note || undefined : undefined}>
                      <Num values={source === "britton" ? entry.brittonValues : entry[source]} field={field} red={entry.red[source]} sms={source === "form" && hasSms(entry)} />
                    </td>
                  )))}
                  <td className="whitespace-nowrap border-l px-3 py-2"><Badge variant={BADGE[entry.verdict]} title={t(`otc.hint.${entry.verdict}`)}>{t(`otc.verdict.${entry.verdict}`)}</Badge>{entry.remark && <div className="mt-1 max-w-[16rem] whitespace-normal text-xs text-muted-foreground">{remarkText(entry, t)}</div>}</td>
                  <td className="px-3 py-2">
                    {entry.proof?.storagePath && (
                      <Button type="button" size="sm" variant="outline" onClick={() => onView?.(entry.proof)} aria-label={t("ocr.view")} title={t("ocr.view")}><Eye className="h-4 w-4" aria-hidden="true" /></Button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">{t("otc.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("otc.footnote")}</p>
    </div>
  );
}
