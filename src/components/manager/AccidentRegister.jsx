import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Download, Plus, ShieldAlert } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ACCIDENT_EVENT, ACCIDENT_KINDS, ACCIDENT_SEVERITIES, MAX_ACCIDENT, accidentToForm, accidentsCsv, createAccident, emptyAccident, fetchAccidents,
  filterAccidents, openAccidentCount, updateAccident, validateAccident,
} from "@/lib/accidents";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { useT } from "@/lib/use-t";
import { cn, withTimeout } from "@/lib/utils";

const textareaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SEVERITY_TONE = {
  first_aid: "border-info/40 bg-info/10 text-info",
  medical: "border-warning/40 bg-warning/15 text-warning",
  lost_time: "border-destructive/40 bg-destructive/10 text-destructive",
  critical: "border-destructive bg-destructive text-destructive-foreground",
};

function Field({ id, label, error, children, className }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <Label htmlFor={id} className="text-xs sm:text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AccidentForm({ initial, people, onSave, onCancel, busy }) {
  const t = useT();
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => validateAccident(form), [form]);
  const bad = (key) => showErrors && errors.includes(key);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const border = (key) => (bad(key) ? "border-destructive" : "");

  // Picking an employee fills the name; « someone else » leaves the name to type.
  function pickEmployee(event) {
    const id = event.target.value;
    const person = people.find((p) => p.id === id);
    setForm((current) => ({ ...current, employee_id: id, person_name: person ? person.full_name || "" : id ? current.person_name : "" }));
  }

  function submit(event) {
    event.preventDefault();
    if (errors.length) { setShowErrors(true); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="acc-date" label={t("accidents.field.date")}>
          <Input id="acc-date" type="date" value={form.occurred_on} onChange={set("occurred_on")} disabled={busy} className={border("occurred_on")} />
        </Field>
        <Field id="acc-time" label={t("accidents.field.time")}>
          <Input id="acc-time" type="time" value={form.occurred_time} onChange={set("occurred_time")} disabled={busy} />
        </Field>
        <Field id="acc-employee" label={t("accidents.field.employee")}>
          <Select id="acc-employee" value={form.employee_id} onChange={pickEmployee} disabled={busy}>
            <option value="">{t("accidents.field.otherPerson")}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id}</option>)}
          </Select>
        </Field>
        <Field id="acc-person" label={t("accidents.field.person")} error={bad("person_name") && t("accidents.errors.fields")} className="sm:col-span-3">
          <Input id="acc-person" value={form.person_name} onChange={set("person_name")} maxLength={MAX_ACCIDENT.person} disabled={busy || Boolean(form.employee_id)} className={border("person_name")} />
        </Field>
        <Field id="acc-kind" label={t("accidents.field.kind")}>
          <Select id="acc-kind" value={form.kind} onChange={set("kind")} disabled={busy}>
            {ACCIDENT_KINDS.map((k) => <option key={k} value={k}>{t(`accidents.kind.${k}`)}</option>)}
          </Select>
        </Field>
        <Field id="acc-severity" label={t("accidents.field.severity")}>
          <Select id="acc-severity" value={form.severity} onChange={set("severity")} disabled={busy}>
            {ACCIDENT_SEVERITIES.map((s) => <option key={s} value={s}>{t(`accidents.severity.${s}`)}</option>)}
          </Select>
        </Field>
        <Field id="acc-lost" label={t("accidents.field.lostDays")} error={bad("lost_days") && t("accidents.errors.fields")}>
          <Input id="acc-lost" type="number" inputMode="numeric" min="0" max={MAX_ACCIDENT.lostDays} value={form.lost_days} onChange={set("lost_days")} disabled={busy} className={border("lost_days")} />
        </Field>
        <Field id="acc-location" label={t("accidents.field.location")} className="sm:col-span-2">
          <Input id="acc-location" value={form.location} onChange={set("location")} maxLength={MAX_ACCIDENT.location} disabled={busy} />
        </Field>
        <Field id="acc-claim" label={t("accidents.field.claim")}>
          <Input id="acc-claim" value={form.cnesst_claim} onChange={set("cnesst_claim")} maxLength={MAX_ACCIDENT.claim} disabled={busy} />
        </Field>
      </div>
      <Field id="acc-description" label={t("accidents.field.description")} error={bad("description") && t("accidents.errors.fields")}>
        <textarea id="acc-description" rows={4} value={form.description} onChange={set("description")} maxLength={MAX_ACCIDENT.description} disabled={busy} className={cn(textareaClass, border("description"))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="acc-witnesses" label={t("accidents.field.witnesses")}>
          <textarea id="acc-witnesses" rows={2} value={form.witnesses} onChange={set("witnesses")} maxLength={MAX_ACCIDENT.witnesses} disabled={busy} className={textareaClass} />
        </Field>
        <Field id="acc-treatment" label={t("accidents.field.treatment")}>
          <textarea id="acc-treatment" rows={2} value={form.treatment} onChange={set("treatment")} maxLength={MAX_ACCIDENT.treatment} disabled={busy} className={textareaClass} />
        </Field>
      </div>
      <Field id="acc-actions" label={t("accidents.field.actions")}>
        <textarea id="acc-actions" rows={3} value={form.corrective_actions} onChange={set("corrective_actions")} maxLength={MAX_ACCIDENT.actions} disabled={busy} className={textareaClass} />
      </Field>
      {showErrors && errors.length > 0 && <p className="text-sm text-destructive">{t("accidents.errors.fields")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{t("accidents.save")}</Button>
        {initial.id && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => onSave({ ...form, status: form.status === "closed" ? "open" : "closed" })}>
            {form.status === "closed" ? t("accidents.reopen") : t("accidents.close")}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{t("accidents.cancel")}</Button>
      </div>
    </form>
  );
}

export default function AccidentRegister() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // a form (new or existing) or null
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAccidents(),
      withTimeout(supabase.from("profiles").select("id, full_name").order("full_name").limit(QUERY_BUDGETS.inventoryPeople), 12000),
    ])
      .then(([list, profiles]) => { if (!cancelled) { setRows(list); setPeople(profiles.data || []); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(friendlyErrorMessage(loadError, t, "accidents.errors.load")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const shown = useMemo(() => filterAccidents(rows, { status, kind, search }), [rows, status, kind, search]);
  const nameOf = (row) => row.person_name || "—";

  async function save(form) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = form.id ? await updateAccident(form.id, form) : await createAccident(form);
      setRows((current) => [saved, ...current.filter((r) => r.id !== saved.id)]
        .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : String(b.created_at).localeCompare(String(a.created_at)))));
      setEditing(null);
      window.dispatchEvent(new Event(ACCIDENT_EVENT));
    } catch (saveError) {
      setError(friendlyErrorMessage(saveError, t, "accidents.errors.save"));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const labels = {
      columns: {
        date: t("accidents.field.date"), time: t("accidents.field.time"), person: t("accidents.field.person"), kind: t("accidents.field.kind"),
        severity: t("accidents.field.severity"), location: t("accidents.field.location"), description: t("accidents.field.description"),
        witnesses: t("accidents.field.witnesses"), treatment: t("accidents.field.treatment"), lostDays: t("accidents.field.lostDays"),
        claim: t("accidents.field.claim"), actions: t("accidents.field.actions"), status: t("accidents.field.status"),
      },
      kind: Object.fromEntries(ACCIDENT_KINDS.map((k) => [k, t(`accidents.kind.${k}`)])),
      severity: Object.fromEntries(ACCIDENT_SEVERITIES.map((s) => [s, t(`accidents.severity.${s}`)])),
      status: { open: t("accidents.status.open"), closed: t("accidents.status.closed") },
    };
    const blob = new Blob(["﻿" + accidentsCsv(shown, labels)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `registre-accidents-${companyDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5" />{t("accidents.title")}</h2>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("accidents.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!shown.length}>
                <Download className="mr-1.5 h-4 w-4" />{t("accidents.export")}
              </Button>
              <Button type="button" size="sm" onClick={() => setEditing(emptyAccident(companyDate()))} disabled={Boolean(editing)}>
                <Plus className="mr-1.5 h-4 w-4" />{t("accidents.new")}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select aria-label={t("accidents.field.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">{t("accidents.filter.open")} ({openAccidentCount(rows)})</option>
              <option value="closed">{t("accidents.filter.closed")}</option>
              <option value="all">{t("accidents.filter.all")}</option>
            </Select>
            <Select aria-label={t("accidents.field.kind")} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">{t("accidents.filter.allKinds")}</option>
              {ACCIDENT_KINDS.map((k) => <option key={k} value={k}>{t(`accidents.kind.${k}`)}</option>)}
            </Select>
            <Input aria-label={t("accidents.search")} placeholder={t("accidents.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="font-semibold">{t("accidents.editTitle")}</h3>
            <AccidentForm key={editing.id || "new"} initial={editing} people={people} busy={busy} onSave={save} onCancel={() => setEditing(null)} />
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}
      {!loading && !shown.length && <p className="text-sm text-muted-foreground">{rows.length ? t("accidents.noMatch") : t("accidents.empty")}</p>}

      <div className="grid gap-2">
        {shown.map((row) => (
          <Card key={row.id} className={cn(row.status === "closed" && "opacity-75")}>
            <CardContent className="p-3">
              <button type="button" className="w-full text-left" onClick={() => setEditing(accidentToForm(row))} disabled={busy || Boolean(editing)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{nameOf(row)}</span>
                  <span className="text-sm text-muted-foreground">{dayjs(row.occurred_on).format("D MMM YYYY")}{row.occurred_time ? ` · ${String(row.occurred_time).slice(0, 5)}` : ""}</span>
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{t(`accidents.kind.${row.kind}`)}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", SEVERITY_TONE[row.severity])}>{t(`accidents.severity.${row.severity}`)}</span>
                  {row.status === "open" && <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs text-warning">{t("accidents.status.open")}</span>}
                  {row.lost_days ? <span className="text-xs text-muted-foreground">{t("accidents.field.lostDays")}: <b>{row.lost_days}</b></span> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
