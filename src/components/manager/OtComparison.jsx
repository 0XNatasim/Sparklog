import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { OCR_FIRST_DAY } from "@/lib/ocr-readings";
import { VERDICTS, brittonDays, buildOtComparison, comparisonDays, countVerdicts, fetchComparisonData, filterComparison } from "@/lib/ot-compare";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

const BADGE = { ok: "success", noProof: "secondary", formGap: "warning", brittonGap: "destructive", missingBritton: "destructive", missingSparklog: "destructive" };

// Two numbers « client / retour », each in red when that source is the odd one out for that field.
function Pair({ values, red, t }) {
  if (!values) return <span className="text-muted-foreground">—</span>;
  const cell = (field, value) => (
    <span className={red.has(field) ? "font-bold text-destructive" : ""}>{value == null ? "—" : value}</span>
  );
  return <span title={t("otc.pairTitle")}>{cell("client", values.client)} <span className="text-muted-foreground">/</span> {cell("return", values.return)}</span>;
}

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
  const dayOptions = useMemo(() => [...new Set(entries.map((entry) => entry.jobDate))].sort().reverse(), [entries]);
  const attention = entries.length - counts.ok;
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
          {data.truncated && <p className="text-sm text-muted-foreground" role="status">{t("otc.truncated")}</p>}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {days.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("otc.noDays")}</p>}
      {days.length > 0 && !loaded && !error && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
      {loaded && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("ocr.col.date")}</th>
                <th className="px-3 py-2">{t("ocr.col.employee")}</th>
                <th className="px-3 py-2">{t("ocr.col.jobOt")}</th>
                <th className="px-3 py-2">{t("otc.col.britton")}</th>
                <th className="px-3 py-2">{t("otc.col.form")}</th>
                <th className="px-3 py-2">{t("otc.col.sparklog")}</th>
                <th className="px-3 py-2">{t("ocr.col.result")}</th>
                <th className="px-3 py-2"><span className="sr-only">{t("ocr.view")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((entry) => (
                <tr key={entry.key}>
                  <td className="whitespace-nowrap px-3 py-2">{dayjs(entry.jobDate).format("DD MMM")}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {entry.userId && entry.name ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className="font-medium text-primary hover:underline">{entry.name}</button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => navigate(timesheetLink(entry))}>{entry.job ? t("ocr.link.job") : t("ocr.link.timesheet")}</DropdownMenuItem></DropdownMenuContent>
                      </DropdownMenu>
                    ) : (entry.name || "—")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{entry.jobOt || entry.ot || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2" title={entry.britton?.note || undefined}><Pair values={entry.brittonValues} red={entry.red.britton} t={t} /></td>
                  <td className="whitespace-nowrap px-3 py-2"><Pair values={entry.form} red={entry.red.form} t={t} /></td>
                  <td className="whitespace-nowrap px-3 py-2"><Pair values={entry.sparklog} red={entry.red.sparklog} t={t} /></td>
                  <td className="whitespace-nowrap px-3 py-2"><Badge variant={BADGE[entry.verdict]} title={t(`otc.hint.${entry.verdict}`)}>{t(`otc.verdict.${entry.verdict}`)}</Badge></td>
                  <td className="px-3 py-2">
                    {entry.proof?.storagePath && (
                      <Button type="button" size="sm" variant="outline" onClick={() => onView?.(entry.proof)} aria-label={t("ocr.view")} title={t("ocr.view")}><Eye className="h-4 w-4" aria-hidden="true" /></Button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">{t("otc.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("otc.footnote")}</p>
    </div>
  );
}
