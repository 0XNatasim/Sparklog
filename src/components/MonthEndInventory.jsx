import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  MONTH_END_MAX_RETENTION_DAYS, MONTH_END_MIN_RETENTION_DAYS, downloadMonthEndZip, fetchMonthEndOverview, fetchPickableEmployees,
  parseRetentionDays, removeMonthEndRequest, requestState, scheduleMonthEnd, setMonthEndRetention, signedMonthEndUrls, waiveMonthEndRequest,
} from "@/lib/month-end-inventory";
import { useT } from "@/lib/use-t";
import { supabase } from "@/supabaseClient";

const STATE_BADGE = { received: "success", waived: "neutral", late: "destructive", due: "warning", scheduled: "outline" };
const keptFiles = (request) => (request.files || []).filter((file) => file.storage_path && !file.purged_at);

// Inventaire › Inventaire fin de mois (0142): schedule the day, see who gave the proof (5 to 10 screenshots of the form),
// look at / download the pictures, « Débloquer » someone, and set how long the pictures are kept.
export default function MonthEndInventory() {
  const t = useT();
  const today = companyDate();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [overview, setOverview] = useState({ rounds: [], retentionDays: 60 });
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [dueDate, setDueDate] = useState(today);
  const [picked, setPicked] = useState(new Set());
  const [retention, setRetention] = useState("");
  const [viewing, setViewing] = useState(null); // { name, urls: [] }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMonthEndOverview(supabase), fetchPickableEmployees(supabase)])
      .then(([data, employees]) => {
        if (cancelled) return;
        setOverview(data);
        setPeople(employees);
        setRetention((current) => current || String(data.retentionDays));
        setError("");
      })
      .catch((loadError) => { if (!cancelled) setError(friendlyErrorMessage(loadError, t, "monthEnd.manager.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, t]);

  const run = useCallback(async (action, doneKey) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (doneKey) setNotice(t(doneKey));
      setReload((n) => n + 1);
      return true;
    } catch (actionError) {
      setError(friendlyErrorMessage(actionError, t, "monthEnd.manager.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, t]);

  const togglePerson = (id) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function schedule(event) {
    event.preventDefault();
    if (!dueDate || dueDate < today || picked.size === 0) { setError(t("monthEnd.manager.scheduleInvalid")); return; }
    if (await run(() => scheduleMonthEnd(supabase, dueDate, [...picked]), "monthEnd.manager.scheduled")) setPicked(new Set());
  }

  async function saveRetention(event) {
    event.preventDefault();
    const days = parseRetentionDays(retention);
    if (days === null) { setError(t("monthEnd.manager.retentionInvalid", { min: MONTH_END_MIN_RETENTION_DAYS, max: MONTH_END_MAX_RETENTION_DAYS })); return; }
    await run(() => setMonthEndRetention(supabase, days), "monthEnd.manager.retentionSaved");
  }

  async function view(request) {
    setError("");
    try {
      const urls = await signedMonthEndUrls(supabase, keptFiles(request).map((file) => file.storage_path));
      setViewing({ name: request.name, urls: [...urls.values()] });
    } catch (viewError) {
      setError(friendlyErrorMessage(viewError, t, "monthEnd.manager.viewFailed"));
    }
  }

  async function download(requests, round, filename) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { saved, skipped } = await downloadMonthEndZip(supabase, requests, round.due_date, { filename });
      if (!saved) setError(t("monthEnd.manager.nothingToDownload"));
      else setNotice(t("monthEnd.manager.downloaded", { count: saved, skipped }));
    } catch (downloadError) {
      setError(friendlyErrorMessage(downloadError, t, "monthEnd.manager.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function waive(request) {
    if (!(await confirm(t("monthEnd.manager.waiveConfirm", { name: request.name })))) return;
    await run(() => waiveMonthEndRequest(supabase, request.id), "monthEnd.manager.waived");
  }

  async function remove(request) {
    if (!(await confirm(t("monthEnd.manager.removeConfirm", { name: request.name })))) return;
    await run(() => removeMonthEndRequest(supabase, request.id), "monthEnd.manager.removed");
  }

  return (
    <div className="space-y-3">
      <Link to="/manager/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{t("monthEnd.manager.back")}
      </Link>
      <Card>
        <CardContent className="space-y-1 p-4">
          <h2 className="text-lg font-bold">{t("monthEnd.manager.pageTitle")}</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">{t("monthEnd.manager.help")}</p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {notice && <p className="text-sm text-success" role="status">{notice}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-semibold">{t("monthEnd.manager.scheduleTitle")}</h3>
          <form className="space-y-3" onSubmit={schedule}>
            <div className="space-y-1">
              <Label htmlFor="month-end-date">{t("monthEnd.manager.dateLabel")}</Label>
              <Input id="month-end-date" type="date" min={today} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="max-w-xs" />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("monthEnd.manager.peopleLabel")}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {people.map((person) => (
                  <label key={person.id} className="flex min-h-9 items-center gap-2 rounded-md border px-2 text-sm">
                    <input type="checkbox" checked={picked.has(person.id)} onChange={() => togglePerson(person.id)} />
                    {person.full_name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" disabled={busy || picked.size === 0}>{t("monthEnd.manager.schedule")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="font-semibold">{t("monthEnd.manager.retentionTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("monthEnd.manager.retentionHelp")}</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={saveRetention}>
            <div className="space-y-1">
              <Label htmlFor="month-end-retention">{t("monthEnd.manager.retentionLabel", { min: MONTH_END_MIN_RETENTION_DAYS, max: MONTH_END_MAX_RETENTION_DAYS })}</Label>
              <Input id="month-end-retention" inputMode="numeric" value={retention} onChange={(event) => setRetention(event.target.value)} className="w-28" />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>{t("common.save")}</Button>
          </form>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}
      {!loading && overview.rounds.length === 0 && <p className="text-sm text-muted-foreground">{t("monthEnd.manager.empty")}</p>}
      {overview.rounds.map((round) => (
        <Card key={round.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{t("monthEnd.manager.roundTitle", { date: round.due_date })}</h3>
              <Button type="button" size="sm" variant="outline" disabled={busy || !round.requests.some((request) => keptFiles(request).length)}
                onClick={() => download(round.requests, round, `inventaire-fin-de-mois-${round.due_date}.zip`)}>
                <Download className="mr-1 h-4 w-4" />{t("monthEnd.manager.downloadRound")}
              </Button>
            </div>
            <ul className="space-y-2">
              {round.requests.map((request) => {
                const state = requestState({ ...request, due_date: round.due_date }, today);
                const kept = keptFiles(request);
                return (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{request.name || t("monthEnd.manager.unknownPerson")}</span>
                      <Badge variant={STATE_BADGE[state]}>{t(`monthEnd.manager.state.${state}`)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {request.files.length ? t("monthEnd.manager.filesCount", { count: request.files.length }) : t("monthEnd.manager.noFile")}
                        {request.files.length > 0 && kept.length === 0 ? ` · ${t("monthEnd.manager.purged")}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {kept.length > 0 && (
                        <>
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => view(request)}>
                            <Eye className="mr-1 h-4 w-4" />{t("monthEnd.manager.view")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busy}
                            onClick={() => download([request], round, `inventaire-fin-de-mois-${round.due_date}-${request.name.split(" ")[0] || "employe"}.zip`)}>
                            <Download className="mr-1 h-4 w-4" />{t("monthEnd.manager.download")}
                          </Button>
                        </>
                      )}
                      {state !== "received" && state !== "waived" && (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => waive(request)}>{t("monthEnd.manager.waive")}</Button>
                      )}
                      {state !== "received" && request.files.length === 0 && (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => remove(request)}>{t("monthEnd.manager.remove")}</Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{viewing?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {(viewing?.urls || []).map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={t("monthEnd.manager.pictureAlt", { n: index + 1 })} className="w-full rounded border object-contain" />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
