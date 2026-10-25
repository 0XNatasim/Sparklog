import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { BellRing, Camera, FilePlus2, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage, isOfflineError } from "@/lib/error-messages";
import { companyDate } from "@/lib/company-time";
import {
  MANAGER_ENTRY_NOTE_MAX,
  buildCreateJobForEmployeeArgs,
  managerEntryDateRange,
  managerEntryState,
  repeatedHourFields,
  validateManagerEntry,
} from "@/lib/manager-entry";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { notifyBroadcastPush, pushOutcome } from "@/lib/push";
import { formatHM, hoursBetween } from "@/lib/time";
import { useT } from "@/lib/use-t";
import { extractWorkOrderText, parseExtractedText } from "@/lib/work-order-ocr";
import { withRetry, withTimeout } from "@/lib/utils";

const ELIGIBLE_ROLES = ["employee", "admin", "subcontractor_1"];
const EMPTY_FORM = { employeeId: "", jobDate: "", ot: "", depart: "", arrivee: "", fin: "", km: "", note: "", departFold: null, finFold: null };
const STATE_VARIANT = { pending: "warning", submitted: "success", approved: "neutral" };

const hhmm = (value) => String(value || "").slice(0, 5);

// Avancé › Feuille de temps d'urgence (owner only). Creates a DRAFT for an employee; the
// employee must review and confirm it from History before it can be submitted.
export default function EmergencyTimesheet() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [form, setForm] = useState({ ...EMPTY_FORM, jobDate: companyDate() });
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remindingId, setRemindingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const imageInputRef = useRef(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const busyRef = useRef(false);
  // One key per logical creation: a retry or double tap resolves to the same job.
  const submissionKeyRef = useRef(crypto.randomUUID());

  const range = useMemo(() => managerEntryDateRange(), []);
  const errors = validateManagerEntry(form);
  // Night of the fall time change (0116): départ / fin in the 1:00-1:59 that happens twice.
  const repeated = repeatedHourFields(form);
  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  const activePeople = useMemo(() => people.filter((p) => !p.is_paused), [people]);
  const totalLabel = useMemo(() => {
    if (!form.depart || !form.fin) return "—";
    const base = form.jobDate || companyDate();
    return formatHM(hoursBetween(dayjs(`${base}T${form.depart}`), dayjs(`${base}T${form.fin}`)));
  }, [form.jobDate, form.depart, form.fin]);

  const loadEntries = useCallback(async () => {
    const { data, error: loadError } = await withTimeout(
      supabase.from("jobs")
        .select("id, user_id, job_date, ot, depart, fin, status, locked, manager_entry_at, manager_entry_by_name, employee_confirmed_at, manager_entry_reminded_at")
        .not("manager_entry_at", "is", null)
        .order("manager_entry_at", { ascending: false })
        .limit(QUERY_BUDGETS.emergencyEntries),
      12000
    );
    if (loadError) throw loadError;
    setEntries(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: profiles, error: profileError }] = await Promise.all([
          withTimeout(
            supabase.from("profiles").select("id, full_name, role, is_paused")
              .in("role", ELIGIBLE_ROLES).order("full_name").limit(QUERY_BUDGETS.emergencyEmployees),
            12000
          ),
          loadEntries(),
        ]);
        if (profileError) throw profileError;
        if (!cancelled) setPeople(profiles || []);
      } catch (loadError) {
        if (!cancelled && !isOfflineError(loadError)) setError(friendlyErrorMessage(loadError, t, "emergency.errors.load"));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const invalid = (key) => showErrors && errors.includes(key);

  async function createEntry(event) {
    event.preventDefault();
    if (busyRef.current) return; // sync guard against a rapid double tap
    setError("");
    setInfo("");
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    const employeeName = nameById.get(form.employeeId) || "";
    const ok = await confirm(t("emergency.confirm", {
      name: employeeName,
      date: form.jobDate,
      from: form.depart,
      to: form.fin,
      total: totalLabel,
    }));
    if (!ok) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { data, error: rpcError } = await withRetry(
        () => supabase.rpc("create_job_for_employee", buildCreateJobForEmployeeArgs(form, submissionKeyRef.current)).single(),
        12000
      );
      if (rpcError) throw rpcError;
      // Phone push (the entry and its in-app message are saved either way); a refusal is said, not hidden.
      const push = data?.broadcast_id ? pushOutcome(await notifyBroadcastPush(data.broadcast_id)) : null;
      setInfo(push?.tone === "warning"
        ? `${t("emergency.created", { name: employeeName })} ${t(push.key, push.params)}`
        : t("emergency.created", { name: employeeName }));
      setForm({ ...EMPTY_FORM, jobDate: companyDate() });
      setShowErrors(false);
      submissionKeyRef.current = crypto.randomUUID();
      await loadEntries().catch(() => undefined);
    } catch (createError) {
      setError(friendlyErrorMessage(createError, t, "emergency.errors.create"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Same screenshot reader as the employee form ("Remplir auto"): date, OT, times and km.
  async function handleAutofill(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || extracting) return;
    setError("");
    setInfo("");
    setExtracting(true);
    try {
      const parsed = parseExtractedText(await extractWorkOrderText(file));
      const hasKm = parsed.km_aller !== null && parsed.km_aller !== undefined;
      if (!parsed.job_date && !parsed.ot && !parsed.depart && !parsed.arrivee && !parsed.fin && !hasKm) {
        setError(t("emergency.autofill.nothingFound"));
        return;
      }
      setForm((current) => ({
        ...current,
        ...(parsed.job_date ? { jobDate: parsed.job_date } : {}),
        ...(parsed.ot ? { ot: String(parsed.ot) } : {}),
        ...(parsed.depart ? { depart: parsed.depart } : {}),
        ...(parsed.arrivee ? { arrivee: parsed.arrivee } : {}),
        ...(parsed.fin ? { fin: parsed.fin } : {}),
        ...(hasKm ? { km: String(parsed.km_aller) } : {}),
      }));
      if (parsed.job_date && (parsed.job_date < range.min || parsed.job_date > range.max)) {
        setError(t("emergency.errors.dateWindow"));
      } else {
        setInfo(t(hasKm ? "emergency.autofill.done" : "emergency.autofill.doneNoKm"));
      }
    } catch (extractError) {
      setError(friendlyErrorMessage(extractError, t, "form.errors.extractFailed"));
    } finally {
      setExtracting(false);
    }
  }

  async function remind(entry) {
    if (remindingId) return;
    setRemindingId(entry.id);
    setError("");
    setInfo("");
    try {
      const { data, error: rpcError } = await withTimeout(
        supabase.rpc("remind_manager_entry", { p_job_id: entry.id }).single(),
        12000
      );
      if (rpcError) throw rpcError;
      const push = data?.broadcast_id ? pushOutcome(await notifyBroadcastPush(data.broadcast_id)) : null;
      const reminded = t("emergency.reminded", { name: nameById.get(entry.user_id) || "" });
      setInfo(push?.tone === "warning" ? `${reminded} ${t(push.key, push.params)}` : reminded);
      await loadEntries().catch(() => undefined);
    } catch (remindError) {
      setError(friendlyErrorMessage(remindError, t, "emergency.errors.remind"));
    } finally {
      setRemindingId(null);
    }
  }

  async function remove(entry) {
    if (deletingId) return;
    setError("");
    setInfo("");
    const ok = await confirm(t("emergency.deleteConfirm", { name: nameById.get(entry.user_id) || "", date: entry.job_date }));
    if (!ok) return;
    setDeletingId(entry.id);
    try {
      const { error: rpcError } = await withTimeout(supabase.rpc("delete_manager_entry", { p_job_id: entry.id }), 12000);
      if (rpcError) throw rpcError;
      setInfo(t("emergency.deleted"));
      await loadEntries().catch(() => undefined);
    } catch (deleteError) {
      setError(friendlyErrorMessage(deleteError, t, "emergency.errors.delete"));
      await loadEntries().catch(() => undefined);
    } finally {
      setDeletingId(null);
    }
  }

  const visibleEntries = pendingOnly ? entries.filter((entry) => managerEntryState(entry) === "pending") : entries;
  const pendingCount = entries.filter((entry) => managerEntryState(entry) === "pending").length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {confirmDialog}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold"><FilePlus2 className="h-5 w-5 text-primary" />{t("emergency.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("emergency.description", { days: 31 })}</p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>
          )}
          {info && (
            <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{info}</div>
          )}

          <form onSubmit={createEntry} className="grid gap-3 sm:grid-cols-2" noValidate>
            <div className="sm:col-span-2">
              <Button type="button" variant="secondary" className="h-12 w-full text-base font-semibold"
                disabled={busy || extracting} onClick={() => imageInputRef.current?.click()}>
                <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
                {extracting ? t("common.extracting") : t("form.buttons.autofill")}
              </Button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleAutofill} />
              <p className="mt-1 text-center text-xs text-muted-foreground">{t("emergency.autofill.hint")}</p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="em-employee">{t("emergency.employee")}</Label>
              <Select id="em-employee" value={form.employeeId} onChange={setField("employeeId")} disabled={busy} aria-invalid={invalid("employee")}
                className={invalid("employee") ? "border-destructive" : ""}>
                <option value="">{t("emergency.employeePlaceholder")}</option>
                {activePeople.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-date">{t("form.date")}</Label>
              <Input id="em-date" type="date" min={range.min} max={range.max} value={form.jobDate} onChange={setField("jobDate")} disabled={busy}
                className={invalid("date") ? "border-destructive" : ""} />
              {invalid("date") && <p className="text-xs text-destructive">{t("emergency.errors.dateWindow")}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-ot">{t("form.ot")}</Label>
              <Input id="em-ot" value={form.ot} onChange={setField("ot")} disabled={busy} className={invalid("ot") ? "border-destructive" : ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-depart">{t("form.depart")}</Label>
              <Input id="em-depart" type="time" value={form.depart} onChange={setField("depart")} disabled={busy} className={invalid("depart") || invalid("interval") ? "border-destructive" : ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-arrivee">{t("form.arrival")}</Label>
              <Input id="em-arrivee" type="time" value={form.arrivee} onChange={setField("arrivee")} disabled={busy} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="em-fin">{t("form.end")}</Label>
              <Input id="em-fin" type="time" value={form.fin} onChange={setField("fin")} disabled={busy} className={invalid("fin") || invalid("interval") ? "border-destructive" : ""} />
              {invalid("interval") && <p className="text-xs text-destructive">{t("form.errors.invalidInterval")}</p>}
            </div>
            {(repeated.depart || repeated.fin) && (
              <fieldset className={`grid gap-2 rounded-md border p-3 text-sm sm:col-span-2 ${invalid("dstChoice") ? "border-destructive bg-destructive/5" : "border-warning/40 bg-warning/10"}`}>
                <legend className="px-1 font-semibold">{t("emergency.dst.title")}</legend>
                <p className="text-muted-foreground">{t("emergency.dst.hint")}</p>
                {[["depart", "departFold", "form.depart"], ["fin", "finFold", "form.end"]].filter(([key]) => repeated[key]).map(([key, foldKey, labelKey]) => (
                  <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium">{t(labelKey)} {form[key]}</span>
                    {[1, 2].map((fold) => (
                      <label key={fold} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name={`em-${foldKey}`}
                          checked={form[foldKey] === fold}
                          onChange={() => setForm((current) => ({ ...current, [foldKey]: fold }))}
                          disabled={busy}
                          className="accent-primary"
                        />
                        {t(fold === 1 ? "emergency.dst.first" : "emergency.dst.second")}
                      </label>
                    ))}
                  </div>
                ))}
                {invalid("dstChoice") && <p className="text-xs text-destructive">{t("emergency.dst.required")}</p>}
              </fieldset>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="em-km">{t("form.kmTotal")}</Label>
              <Input id="em-km" type="text" inputMode="decimal" value={form.km} onChange={setField("km")} disabled={busy} className={invalid("km") ? "border-destructive" : ""} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>{t("form.totalHours")}</Label>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{totalLabel}</div>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="em-note">{t("emergency.note")}</Label>
              <Input id="em-note" value={form.note} maxLength={MANAGER_ENTRY_NOTE_MAX} onChange={setField("note")} disabled={busy}
                placeholder={t("emergency.notePlaceholder")} className={invalid("note") ? "border-destructive" : ""} />
              {invalid("note") && <p className="text-xs text-destructive">{t("emergency.errors.note")}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={busy}>
                {busy ? t("common.saving") : t("emergency.create")}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">{t("emergency.draftNote")}</p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">{t("emergency.listTitle")}</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
              {t("emergency.pendingOnly", { count: pendingCount })}
            </label>
          </div>
          {visibleEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emergency.empty")}</p>
          ) : (
            <ul className="divide-y">
              {visibleEntries.map((entry) => {
                const state = managerEntryState(entry);
                return (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{nameById.get(entry.user_id) || "—"} · {entry.job_date}</div>
                      <div className="text-xs text-muted-foreground">
                        OT {entry.ot} · {hhmm(entry.depart)}–{hhmm(entry.fin)}
                        {entry.manager_entry_by_name ? ` · ${entry.manager_entry_by_name}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATE_VARIANT[state] || "secondary"} className="uppercase tracking-wide">{t(`emergency.state.${state}`)}</Badge>
                      {state === "pending" && (
                        <>
                          <Button type="button" size="sm" variant="outline" disabled={Boolean(remindingId || deletingId)} onClick={() => remind(entry)}>
                            <BellRing className="mr-1 h-4 w-4" aria-hidden="true" />
                            {remindingId === entry.id ? t("common.saving") : t("emergency.remind")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={Boolean(remindingId || deletingId)} onClick={() => remove(entry)}>
                            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                            {deletingId === entry.id ? t("common.saving") : t("emergency.delete")}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
